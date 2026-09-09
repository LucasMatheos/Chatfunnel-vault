# Calendar — Google Sync (Entrega 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer os eventos de uma agenda Google recém-conectada aparecerem na view de calendário do front, corrigindo o backfill na criação, eventos de dia inteiro, o filtro de datas por sobreposição e a visibilidade de agendas novas no front.

**Architecture:** A lógica de sincronização bidirecional + watch já existe, mas está trancada como método privado do `UpdateGoogleCalendarHandler`. Extraímos para um `CalendarSyncService` idempotente (services), chamado tanto no create (quando conecta ao Google) quanto no update. Corrigimos o overlap sobrescrevendo o método no repo subclass do services (sem tocar no core). No front, trocamos a preferência de colaboradores para modelo "esconder" (agenda nova nasce visível) e fazemos o dialog de configuração emitir `saved` para a view recarregar colaboradores + eventos.

**Tech Stack:** NestJS 10 + SWC + Jest (chatfunnel-services); Vue 3 + Vite + Vitest/happy-dom (chatfunnel-front); Prisma (via `@chatfunnel/core`, sem edição/rebuild).

## Global Constraints

- NENHUMA edição em `chatfunnel-core` — Entrega 1 vive só em `chatfunnel-services` e `chatfunnel-front`. O overlap é corrigido por override no subclass do services.
- NENHUMA migration, `prisma migrate` ou `db push` — schema intocado.
- `accountId` em toda query (multi-tenancy). Soft delete via `isCancelled` (já existente).
- Backend: double quotes + semicolons (Prettier do services). Front: single quotes, sem semicolons, `printWidth` 100.
- Strings user-facing em pt-BR acentuado.
- Front: ícones só `@phosphor-icons/vue` em código novo (este plano não adiciona ícones).
- Git: criar branch por sub-repo (`fix/calendar-google-sync`); NUNCA commit em `main`/`release`; NUNCA `Co-Authored-By`. Os passos de commit deste plano só devem ser executados quando o usuário pedir **explicitamente** durante a execução — por padrão, NÃO commitar.

---

## File Structure

**chatfunnel-services:**
- Create: `src/modules/google_calendars/services/calendar-sync.service.ts` — `CalendarSyncService` (sync bidirecional + watch + stopWatch).
- Create: `src/modules/google_calendars/services/calendar-sync.service.spec.ts` — testes unitários do sync.
- Modify: `src/modules/google_calendars/commands/update/handler.ts` — delega sync/stopWatch ao service.
- Modify: `src/modules/google_calendars/commands/create/handler.ts` — chama `syncAndWatch` quando conecta ao Google.
- Modify: `src/modules/google_calendars/services/google_calendars.service.ts` — injeta e repassa o service aos handlers.
- Modify: `src/modules/google_calendars/google_calendars.module.ts` — registra `CalendarSyncService` e `GoogleCalendarApiService`.
- Modify: `src/database/repositories/google_calendar_events.repository.ts` — override do `findManyByAccountIdAndDateRange` (overlap).
- Create: `src/database/repositories/google_calendar_events.repository.spec.ts` — teste do overlap (mock Prisma).

**chatfunnel-front:**
- Create: `src/views/calendar/collaboratorPreferences.ts` — util de preferência (modelo "esconder").
- Create: `src/views/calendar/collaboratorPreferences.spec.ts` — testes do util.
- Modify: `src/views/calendar/index.vue` — usa o util + handler `@saved`.
- Modify: `src/views/configuration/integrations/components/configureGoogleCalendars/index.vue` — emite `saved`.

---

## Task 1: `CalendarSyncService` (extração + fix all-day)

**Files:**
- Create: `chatfunnel-services/src/modules/google_calendars/services/calendar-sync.service.ts`
- Test: `chatfunnel-services/src/modules/google_calendars/services/calendar-sync.service.spec.ts`

**Interfaces:**
- Consumes: repos do services (`GoogleCalendarsRepository`, `GoogleCalendarEventsRepository`, `GoogleConnectionsRepository`) e `GoogleCalendarApiService` de `@chatfunnel/core/services`. Métodos usados (já existentes): `googleConnectionsRepository.findById(id, accountId)`, `apiService.getAuthenticatedClient(tokens, connectionId, connectionsRepo)`, `apiService.listEvents(auth, calendarId, timeMinIso, timeMaxIso)`, `apiService.createEvent(auth, calendarId, {summary,description,start,end})`, `apiService.watchCalendar(auth, calendarId, channelId)` → `{ resourceId, expiration }`, `apiService.stopWatchCalendar(auth, watchGoogleId, watchResourceId)`, `eventsRepository.findManyByAccountIdAndDateRange(accountId, start, end, [calId])`, `eventsRepository.upsertByGoogleEventId(googleEventId, data)`, `eventsRepository.updateById(id, {googleEventId})`, `calendarsRepository.updateWatchFields(id, {watchGoogleId, watchResourceId, watchExpiry})`, `calendarsRepository.clearWatchFields(id)`, `calendarsRepository.findByIdAndAccountId(id, accountId)`.
- Produces:
  - `syncAndWatch(params: { calendarId: string; accountId: string; googleConnectionId: string; googleCalendarId: string }): Promise<void>` — nunca lança (loga e retorna).
  - `stopWatch(calendarId: string, googleConnectionId: string, accountId: string): Promise<void>`.

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// chatfunnel-services/src/modules/google_calendars/services/calendar-sync.service.spec.ts
import { CalendarSyncService } from "./calendar-sync.service";

describe("CalendarSyncService.syncAndWatch", () => {
  const params = {
    calendarId: "cal-1",
    accountId: "acc-1",
    googleConnectionId: "conn-1",
    googleCalendarId: "primary",
  };

  const timed = (over: any = {}) => ({
    id: "g-timed",
    summary: "Reunião",
    start: { dateTime: "2026-07-20T14:00:00-03:00" },
    end: { dateTime: "2026-07-20T15:00:00-03:00" },
    status: "confirmed",
    ...over,
  });

  const makeService = ({ apiOverrides = {}, dbEvents = [] }: any = {}) => {
    const upsertByGoogleEventId = jest.fn().mockResolvedValue({});
    const updateWatchFields = jest.fn().mockResolvedValue({});
    const eventsRepo: any = {
      findManyByAccountIdAndDateRange: jest.fn().mockResolvedValue(dbEvents),
      upsertByGoogleEventId,
      updateById: jest.fn().mockResolvedValue({}),
    };
    const calendarsRepo: any = { updateWatchFields, clearWatchFields: jest.fn() };
    const connectionsRepo: any = {
      findById: jest.fn().mockResolvedValue({ id: "conn-1", tokens: {} }),
    };
    const api: any = {
      getAuthenticatedClient: jest.fn().mockResolvedValue({}),
      listEvents: jest.fn().mockResolvedValue([]),
      createEvent: jest.fn().mockResolvedValue({ id: "g-created" }),
      watchCalendar: jest
        .fn()
        .mockResolvedValue({ resourceId: "res-1", expiration: "9999999999999" }),
      stopWatchCalendar: jest.fn().mockResolvedValue({}),
      ...apiOverrides,
    };
    const service = new CalendarSyncService(
      calendarsRepo,
      eventsRepo,
      connectionsRepo,
      api,
    );
    return { service, upsertByGoogleEventId, updateWatchFields, api };
  };

  it("importa eventos com horário E de dia inteiro, e registra o watch", async () => {
    const { service, upsertByGoogleEventId, updateWatchFields } = makeService({
      apiOverrides: {
        listEvents: jest.fn().mockResolvedValue([
          timed(),
          {
            id: "g-allday",
            summary: "Feriado",
            start: { date: "2026-07-21" },
            end: { date: "2026-07-22" },
            status: "confirmed",
          },
        ]),
      },
    });

    await service.syncAndWatch(params);

    const importedIds = upsertByGoogleEventId.mock.calls.map((c) => c[0]);
    expect(importedIds).toContain("g-timed");
    expect(importedIds).toContain("g-allday"); // prova o fix de all-day
    expect(updateWatchFields).toHaveBeenCalledTimes(1);
  });

  it("é idempotente: evento já sincronizado não é re-importado nem re-enviado", async () => {
    const { service, upsertByGoogleEventId, api } = makeService({
      dbEvents: [
        {
          id: "db-1",
          googleEventId: "g-timed",
          startAt: new Date("2026-07-20T17:00:00Z"),
          endAt: new Date("2026-07-20T18:00:00Z"),
          isCancelled: false,
        },
      ],
      apiOverrides: { listEvents: jest.fn().mockResolvedValue([timed()]) },
    });

    await service.syncAndWatch(params);

    expect(api.createEvent).not.toHaveBeenCalled(); // não re-envia pro Google
    expect(upsertByGoogleEventId).not.toHaveBeenCalled(); // não re-importa
  });

  it("ignora evento cancelado e evento sem datas válidas", async () => {
    const { service, upsertByGoogleEventId } = makeService({
      apiOverrides: {
        listEvents: jest.fn().mockResolvedValue([
          timed({ id: "g-cancel", status: "cancelled" }),
          { id: "g-nodate", summary: "X", start: {}, end: {}, status: "confirmed" },
        ]),
      },
    });

    await service.syncAndWatch(params);

    expect(upsertByGoogleEventId).not.toHaveBeenCalled();
  });

  it("não quebra quando listEvents falha e ainda registra o watch", async () => {
    const { service, updateWatchFields } = makeService({
      apiOverrides: {
        listEvents: jest.fn().mockRejectedValue(new Error("Google down")),
      },
    });

    await expect(service.syncAndWatch(params)).resolves.toBeUndefined();
    expect(updateWatchFields).toHaveBeenCalledTimes(1);
  });

  it("não lança quando a conexão não existe", async () => {
    const { service } = makeService();
    (service as any).googleConnectionsRepository.findById = jest
      .fn()
      .mockResolvedValue(null);
    await expect(service.syncAndWatch(params)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-services && npx jest src/modules/google_calendars/services/calendar-sync.service.spec.ts`
Expected: FAIL — `Cannot find module './calendar-sync.service'`.

- [ ] **Step 3: Implementar o `CalendarSyncService`**

```typescript
// chatfunnel-services/src/modules/google_calendars/services/calendar-sync.service.ts
import { Injectable } from "@nestjs/common";
import { GoogleCalendarsRepository } from "src/database/repositories/google_calendars.repository";
import { GoogleCalendarEventsRepository } from "src/database/repositories/google_calendar_events.repository";
import { GoogleConnectionsRepository } from "src/database/repositories/google_connections.repository";
import { GoogleCalendarApiService } from "@chatfunnel/core/services";
import { v4 as uuidv4 } from "uuid";

interface SyncParams {
  calendarId: string;
  accountId: string;
  googleConnectionId: string;
  googleCalendarId: string;
}

@Injectable()
export class CalendarSyncService {
  constructor(
    private readonly googleCalendarsRepository: GoogleCalendarsRepository,
    private readonly googleCalendarEventsRepository: GoogleCalendarEventsRepository,
    private readonly googleConnectionsRepository: GoogleConnectionsRepository,
    private readonly googleCalendarApiService: GoogleCalendarApiService,
  ) {}

  // Nunca lança: loga e retorna. Idempotente (compara por googleEventId).
  async syncAndWatch(params: SyncParams): Promise<void> {
    const { calendarId, accountId, googleConnectionId, googleCalendarId } =
      params;
    try {
      const connection = await this.googleConnectionsRepository.findById(
        googleConnectionId,
        accountId,
      );
      if (!connection) return;

      const auth = await this.googleCalendarApiService.getAuthenticatedClient(
        connection.tokens,
        connection.id,
        this.googleConnectionsRepository,
      );

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const oneYearAhead = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      const dbEvents =
        (await this.googleCalendarEventsRepository.findManyByAccountIdAndDateRange(
          accountId,
          startOfToday,
          oneYearAhead,
          [calendarId],
        )) as any[];

      let googleEvents: any[] = [];
      try {
        googleEvents = await this.googleCalendarApiService.listEvents(
          auth,
          googleCalendarId,
          startOfToday.toISOString(),
          oneYearAhead.toISOString(),
        );
      } catch (err: any) {
        console.error(
          "[CalendarSync] Failed to list Google events:",
          err.message,
        );
      }

      const googleIdsInGoogle = new Set(
        googleEvents.map((e: any) => e.id).filter(Boolean),
      );
      const googleIdsInDb = new Set(
        dbEvents
          .filter((e: any) => e.googleEventId)
          .map((e: any) => e.googleEventId),
      );

      // 1. Push banco -> Google (só o que não existe no Google)
      for (const evt of dbEvents) {
        if (evt.isCancelled) continue;
        if (evt.googleEventId && googleIdsInGoogle.has(evt.googleEventId))
          continue;

        try {
          const created = await this.googleCalendarApiService.createEvent(
            auth,
            googleCalendarId,
            {
              summary: evt.title ?? "",
              description: evt.description ?? "",
              start: {
                dateTime: new Date(evt.startAt).toISOString(),
                timeZone: "America/Sao_Paulo",
              },
              end: {
                dateTime: new Date(evt.endAt).toISOString(),
                timeZone: "America/Sao_Paulo",
              },
            },
          );
          await this.googleCalendarEventsRepository.updateById(evt.id, {
            googleEventId: created.id!,
          });
          googleIdsInDb.add(created.id!);
        } catch (err: any) {
          console.error(
            `[CalendarSync] Failed push "${evt.title}":`,
            err.message,
          );
        }
      }

      // 2. Import Google -> banco (aceita evento com horário E de dia inteiro)
      for (const gEvt of googleEvents) {
        const gStart = gEvt.start?.dateTime ?? gEvt.start?.date;
        const gEnd = gEvt.end?.dateTime ?? gEvt.end?.date;
        if (!gEvt.id || !gStart || !gEnd) continue;
        if (gEvt.status === "cancelled") continue;
        if (googleIdsInDb.has(gEvt.id)) continue;

        try {
          await this.googleCalendarEventsRepository.upsertByGoogleEventId(
            gEvt.id,
            {
              googleEventId: gEvt.id,
              accountId,
              googleCalendarId: calendarId,
              title: gEvt.summary ?? "",
              description: gEvt.description ?? null,
              startAt: new Date(gStart),
              endAt: new Date(gEnd),
              meetingLink: gEvt.hangoutLink ?? null,
            },
          );
          googleIdsInDb.add(gEvt.id);
        } catch (err: any) {
          console.error(
            `[CalendarSync] Failed import "${gEvt.summary}":`,
            err.message,
          );
        }
      }

      // 3. Watch imediato (não espera o cron de 6h)
      try {
        const channelId = uuidv4();
        const watch = await this.googleCalendarApiService.watchCalendar(
          auth,
          googleCalendarId,
          channelId,
        );
        await this.googleCalendarsRepository.updateWatchFields(calendarId, {
          watchGoogleId: channelId,
          watchResourceId: watch.resourceId!,
          watchExpiry: new Date(Number(watch.expiration)),
        });
      } catch (err: any) {
        console.error("[CalendarSync] Failed to set up watch:", err.message);
      }
    } catch (err: any) {
      console.error("[CalendarSync] syncAndWatch failed:", err.message);
    }
  }

  async stopWatch(
    calendarId: string,
    googleConnectionId: string,
    accountId: string,
  ): Promise<void> {
    try {
      const cal = (await this.googleCalendarsRepository.findByIdAndAccountId(
        calendarId,
        accountId,
      )) as any;
      if (!cal || !cal.watchGoogleId || !cal.watchResourceId) return;

      const connection = await this.googleConnectionsRepository.findById(
        googleConnectionId,
        accountId,
      );
      if (!connection) return;

      const auth = await this.googleCalendarApiService.getAuthenticatedClient(
        connection.tokens,
        connection.id,
        this.googleConnectionsRepository,
      );

      try {
        await this.googleCalendarApiService.stopWatchCalendar(
          auth,
          cal.watchGoogleId,
          cal.watchResourceId,
        );
      } catch (err: any) {
        console.error("[CalendarSync] Google stopWatch error:", err.message);
      }

      await this.googleCalendarsRepository.clearWatchFields(calendarId);
    } catch (err: any) {
      console.error("[CalendarSync] stopWatch failed:", err.message);
    }
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-services && npx jest src/modules/google_calendars/services/calendar-sync.service.spec.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/google_calendars/services/calendar-sync.service.ts src/modules/google_calendars/services/calendar-sync.service.spec.ts
git commit -m "feat(calendar): extrai CalendarSyncService com fix de eventos all-day"
```

---

## Task 2: Wiring do service + refactor do update handler

**Files:**
- Modify: `chatfunnel-services/src/modules/google_calendars/google_calendars.module.ts`
- Modify: `chatfunnel-services/src/modules/google_calendars/services/google_calendars.service.ts`
- Modify: `chatfunnel-services/src/modules/google_calendars/commands/update/handler.ts`

**Interfaces:**
- Consumes: `CalendarSyncService` (Task 1) — `syncAndWatch(params)`, `stopWatch(calendarId, googleConnectionId, accountId)`.
- Produces: `UpdateGoogleCalendarHandler` com novo construtor `(googleCalendarsRepository, googleCalendarAvailableSlotsRepository, googleCalendarSubscribersRepository, accountsRepository, calendarSync)`.

- [ ] **Step 1: Registrar providers no módulo**

Em `google_calendars.module.ts`, adicionar os imports e providers:

```typescript
import { CalendarSyncService } from "./services/calendar-sync.service";
import { GoogleCalendarApiService } from "@chatfunnel/core/services";
```

E no array `providers` (após `GoogleCalendarEventsRepository`):

```typescript
    GoogleCalendarEventsRepository,
    GoogleCalendarApiService,
    CalendarSyncService,
```

- [ ] **Step 2: Injetar o service no `GoogleCalendarsService` e repassar aos handlers**

Em `services/google_calendars.service.ts`, adicionar o import:

```typescript
import { CalendarSyncService } from "./calendar-sync.service";
```

Adicionar ao construtor (novo último parâmetro):

```typescript
    private readonly accountsRepository: AccountsRepository,
    private readonly calendarSync: CalendarSyncService,
  ) {}
```

Atualizar `create()` para passar o service:

```typescript
  async create(accountId: string, dto: CreateGoogleCalendarDto) {
    return new CreateGoogleCalendarHandler(
      this.googleCalendarsRepository,
      this.googleCalendarAvailableSlotsRepository,
      this.googleCalendarSubscribersRepository,
      this.googleConnectionsRepository,
      this.accountsRepository,
      this.calendarSync,
    ).execute(accountId, dto);
  }
```

Atualizar `update()` para o novo construtor (remove events/connections repos, adiciona calendarSync):

```typescript
  async update(accountId: string, id: string, dto: UpdateGoogleCalendarDto) {
    return new UpdateGoogleCalendarHandler(
      this.googleCalendarsRepository,
      this.googleCalendarAvailableSlotsRepository,
      this.googleCalendarSubscribersRepository,
      this.accountsRepository,
      this.calendarSync,
    ).execute(accountId, id, dto);
  }
```

- [ ] **Step 3: Refatorar `UpdateGoogleCalendarHandler` para delegar**

Em `commands/update/handler.ts`, substituir os imports do topo (remover `GoogleCalendarApiService`, `uuidv4`, `GoogleCalendarEventsRepository` e `GoogleConnectionsRepository`; `moment` continua) e adicionar `CalendarSyncService`:

```typescript
import { CommandHandler } from "src/core/command.handler";
import { BadRequestException } from "@nestjs/common";
import { UpdateGoogleCalendarDto } from "./dto";
import { GoogleCalendars } from "@chatfunnel/core/database";
import { GoogleCalendarsRepository } from "src/database/repositories/google_calendars.repository";
import { AccountsRepository } from "src/database/repositories/accounts.repository";
import { GoogleCalendarAvailableSlotsRepository } from "src/database/repositories/google_calendar_available_slots.repository";
import { GoogleCalendarSubscribersRepository } from "src/database/repositories/google_calendar_subscribers.repository";
import { CalendarSyncService } from "src/modules/google_calendars/services/calendar-sync.service";
import moment from "moment";
```

Substituir o construtor:

```typescript
  constructor(
    private readonly googleCalendarsRepository: GoogleCalendarsRepository,
    private readonly googleCalendarAvailableSlotsRepository: GoogleCalendarAvailableSlotsRepository,
    private readonly googleCalendarSubscribersRepository: GoogleCalendarSubscribersRepository,
    private readonly accountsRepository: AccountsRepository,
    private readonly calendarSync: CalendarSyncService,
  ) {
    super();
  }
```

Substituir os dois blocos de efeito (o `if (disconnectingFromGoogle)` e o `if (migratingToGoogle)`, hoje fire-and-forget) por delegação com `await`:

```typescript
    if (disconnectingFromGoogle) {
      await this.calendarSync.stopWatch(
        calendar.id,
        (calendar as any).googleConnectionId,
        accountId,
      );
    }

    if (migratingToGoogle) {
      await this.calendarSync.syncAndWatch({
        calendarId: calendar.id,
        accountId,
        googleConnectionId: dto.googleConnectionId,
        googleCalendarId: dto.calendarId,
      });
    }

    return updated;
```

Apagar os métodos privados `syncCalendar(...)` e `stopWatch(...)` inteiros (do fim do arquivo — antigas linhas 161–355).

- [ ] **Step 4: Verificar que compila e os testes existentes passam**

Run: `cd chatfunnel-services && npx tsc --noEmit -p tsconfig.json && npx jest src/modules/google_calendars`
Expected: sem erros de tipo; specs de `google_calendars` (controller/service) continuam PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/google_calendars/google_calendars.module.ts src/modules/google_calendars/services/google_calendars.service.ts src/modules/google_calendars/commands/update/handler.ts
git commit -m "refactor(calendar): update handler delega sync ao CalendarSyncService"
```

---

## Task 3: Backfill na criação de agenda Google

**Files:**
- Modify: `chatfunnel-services/src/modules/google_calendars/commands/create/handler.ts`
- Test: `chatfunnel-services/src/modules/google_calendars/commands/create/handler.spec.ts`

**Interfaces:**
- Consumes: `CalendarSyncService.syncAndWatch(params)` (Task 1).
- Produces: `CreateGoogleCalendarHandler` com construtor `(googleCalendarsRepository, googleCalendarAvailableSlotsRepository, googleCalendarSubscribersRepository, googleConnectionsRepository, accountsRepository, calendarSync)`.

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// chatfunnel-services/src/modules/google_calendars/commands/create/handler.spec.ts
import { CreateGoogleCalendarHandler } from "./handler";

describe("CreateGoogleCalendarHandler", () => {
  const baseDto: any = {
    userId: "user-1",
    name: "Agenda",
    subscribers: [],
    availableSlots: [],
    calendarType: "ID",
    limitType: "WEEKS",
    weeksAhead: 4,
  };

  const makeDeps = () => {
    const calendarsRepo: any = {
      findByAccountId: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: "cal-1" }),
      findByIdAndAccountId: jest.fn().mockResolvedValue({ id: "cal-1" }),
    };
    const slotsRepo: any = { create: jest.fn() };
    const subsRepo: any = { createMany: jest.fn() };
    const connectionsRepo: any = {
      findById: jest.fn().mockResolvedValue({ id: "conn-1" }),
    };
    const accountsRepo: any = {
      findByIdAndModerators: jest.fn().mockResolvedValue({ id: "acc-1" }),
      checkModerators: jest.fn().mockResolvedValue(true),
    };
    const calendarSync: any = {
      syncAndWatch: jest.fn().mockResolvedValue(undefined),
    };
    const handler = new CreateGoogleCalendarHandler(
      calendarsRepo,
      slotsRepo,
      subsRepo,
      connectionsRepo,
      accountsRepo,
      calendarSync,
    );
    return { handler, calendarSync };
  };

  it("dispara syncAndWatch quando a agenda conecta ao Google", async () => {
    const { handler, calendarSync } = makeDeps();
    await handler.execute("acc-1", {
      ...baseDto,
      googleConnectionId: "conn-1",
      calendarId: "primary",
    });
    expect(calendarSync.syncAndWatch).toHaveBeenCalledWith({
      calendarId: "cal-1",
      accountId: "acc-1",
      googleConnectionId: "conn-1",
      googleCalendarId: "primary",
    });
  });

  it("NÃO dispara sync para agenda nativa (sem googleConnectionId)", async () => {
    const { handler, calendarSync } = makeDeps();
    await handler.execute("acc-1", { ...baseDto });
    expect(calendarSync.syncAndWatch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-services && npx jest src/modules/google_calendars/commands/create/handler.spec.ts`
Expected: FAIL — o construtor atual não recebe `calendarSync` e `syncAndWatch` nunca é chamado.

- [ ] **Step 3: Alterar o `CreateGoogleCalendarHandler`**

Em `commands/create/handler.ts`, adicionar o import:

```typescript
import { CalendarSyncService } from "src/modules/google_calendars/services/calendar-sync.service";
```

Adicionar o parâmetro ao construtor (novo último):

```typescript
    private readonly accountsRepository: AccountsRepository,
    private readonly calendarSync: CalendarSyncService,
  ) {
    super();
  }
```

Substituir o `return` final por: sincronizar antes de retornar quando conectou ao Google:

```typescript
    const created = await this.googleCalendarsRepository.findByIdAndAccountId(
      calendar.id,
      accountId,
    );

    if (!isNative && dto.calendarId) {
      await this.calendarSync.syncAndWatch({
        calendarId: calendar.id,
        accountId,
        googleConnectionId: dto.googleConnectionId,
        googleCalendarId: dto.calendarId,
      });
    }

    return created;
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-services && npx jest src/modules/google_calendars/commands/create/handler.spec.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/google_calendars/commands/create/handler.ts src/modules/google_calendars/commands/create/handler.spec.ts
git commit -m "fix(calendar): backfill + watch ao criar agenda ja conectada ao Google"
```

---

## Task 4: Corrigir filtro de datas para sobreposição (overlap)

**Files:**
- Modify: `chatfunnel-services/src/database/repositories/google_calendar_events.repository.ts`
- Test: `chatfunnel-services/src/database/repositories/google_calendar_events.repository.spec.ts`

**Interfaces:**
- Produces: override de `findManyByAccountIdAndDateRange(accountId, startAt, endAt, googleCalendarIds?)` no subclass do services, com semântica de sobreposição (`startAt <= endDate && endAt >= startDate`).

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// chatfunnel-services/src/database/repositories/google_calendar_events.repository.spec.ts
import { GoogleCalendarEventsRepository } from "./google_calendar_events.repository";

describe("GoogleCalendarEventsRepository.findManyByAccountIdAndDateRange", () => {
  it("usa where de sobreposição semiaberta (startAt<fim, endAt>início), não containment", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma: any = { googleCalendarEvents: { findMany } };
    const repo = new GoogleCalendarEventsRepository(prisma);

    const start = new Date("2026-07-13T00:00:00Z");
    const end = new Date("2026-07-20T00:00:00Z");
    await repo.findManyByAccountIdAndDateRange("acc-1", start, end);

    const where = findMany.mock.calls[0][0].where;
    expect(where.startAt).toEqual({ lt: end });
    expect(where.endAt).toEqual({ gt: start });
    expect(where.accountId).toBe("acc-1");
    expect(where.isCancelled).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-services && npx jest src/database/repositories/google_calendar_events.repository.spec.ts`
Expected: FAIL — o método herdado do core usa `startAt: { gte }` / `endAt: { lte }`.

- [ ] **Step 3: Sobrescrever o método no subclass do services**

Substituir o conteúdo de `src/database/repositories/google_calendar_events.repository.ts` por:

```typescript
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { GoogleCalendarEventsRepository as Base } from "@chatfunnel/core/repositories";
export {
  GoogleCalendarEventsTimeFilter,
  GoogleCalendarEventsTimeFilterValues,
  GoogleCalendarEventsStatusFilter,
  GoogleCalendarEventsStatusFilterValues,
} from "@chatfunnel/core/repositories";

@Injectable()
export class GoogleCalendarEventsRepository extends Base {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  // Override: sobreposição semiaberta de intervalos (o base do core usa
  // containment, que descarta eventos que cruzam a borda da janela). lt/gt
  // casa com o activeEnd EXCLUSIVO do FullCalendar. Alinhar o core na Entrega 2.
  // Ver docs/superpowers/plans/2026-07-15-calendar-google-sync-delivery-1.md
  async findManyByAccountIdAndDateRange(
    accountId: string,
    startAt: Date,
    endAt: Date,
    googleCalendarIds?: string[],
  ): Promise<any[]> {
    return this.prisma.googleCalendarEvents.findMany({
      where: {
        accountId,
        isCancelled: false,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        ...(googleCalendarIds?.length
          ? { googleCalendarId: { in: googleCalendarIds } }
          : {}),
      },
      include: {
        googleCalendar: {
          include: {
            user: {
              select: { id: true, name: true, email: true, photo: true },
            },
          },
        },
      },
      orderBy: { startAt: "asc" },
    });
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-services && npx jest src/database/repositories/google_calendar_events.repository.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/database/repositories/google_calendar_events.repository.ts src/database/repositories/google_calendar_events.repository.spec.ts
git commit -m "fix(calendar): filtro de eventos por sobreposicao de intervalos"
```

---

## Task 5: Preferência de colaboradores por "esconder" (agenda nova visível)

**Files:**
- Create: `chatfunnel-front/src/views/calendar/collaboratorPreferences.ts`
- Test: `chatfunnel-front/src/views/calendar/collaboratorPreferences.spec.ts`

**Interfaces:**
- Produces:
  - `loadSelectedCollaborators(accountId: string, availableIds: string[]): string[]` — retorna todos os disponíveis menos os explicitamente escondidos (agenda nova → visível).
  - `saveSelectedCollaborators(accountId: string, selectedIds: string[], availableIds: string[]): void` — persiste os escondidos (`available - selected`).

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// chatfunnel-front/src/views/calendar/collaboratorPreferences.spec.ts
import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadSelectedCollaborators,
  saveSelectedCollaborators
} from './collaboratorPreferences'

describe('collaboratorPreferences', () => {
  beforeEach(() => localStorage.clear())

  it('sem preferência salva, retorna todos os disponíveis', () => {
    expect(loadSelectedCollaborators('acc-1', ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('persiste os desmarcados e os mantém escondidos', () => {
    saveSelectedCollaborators('acc-1', ['a'], ['a', 'b'])
    expect(loadSelectedCollaborators('acc-1', ['a', 'b'])).toEqual(['a'])
  })

  it('agenda nova nasce visível mesmo com desmarcação anterior', () => {
    saveSelectedCollaborators('acc-1', ['a'], ['a', 'b']) // b escondido
    // chega a agenda "c"
    expect(loadSelectedCollaborators('acc-1', ['a', 'b', 'c'])).toEqual(['a', 'c'])
  })

  it('isola por accountId', () => {
    saveSelectedCollaborators('acc-1', ['a'], ['a', 'b'])
    expect(loadSelectedCollaborators('acc-2', ['a', 'b'])).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-front && npx vitest run src/views/calendar/collaboratorPreferences.spec.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o util**

```typescript
// chatfunnel-front/src/views/calendar/collaboratorPreferences.ts
const storageKey = (accountId: string) =>
  `calendar_hidden_collaborators_v2_${accountId || 'default'}`

function readHidden(accountId: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(accountId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (_) {
    return []
  }
}

// Retorna todos os disponíveis menos os explicitamente escondidos.
// Agenda nova (não presente em "hidden") nasce visível.
export function loadSelectedCollaborators(
  accountId: string,
  availableIds: string[]
): string[] {
  const hidden = readHidden(accountId)
  return availableIds.filter((id) => !hidden.includes(id))
}

// Persiste os escondidos = disponíveis menos os selecionados.
export function saveSelectedCollaborators(
  accountId: string,
  selectedIds: string[],
  availableIds: string[]
): void {
  const hidden = availableIds.filter((id) => !selectedIds.includes(id))
  try {
    localStorage.setItem(storageKey(accountId), JSON.stringify(hidden))
  } catch (_) {
    // ignore
  }
}
```

> **Nota:** a chave nova `calendar_hidden_collaborators_v2_*` **ignora** a preferência antiga (`calendar_selected_collaborators_*`); na primeira carga nenhuma agenda fica escondida (todas visíveis). Comportamento aceitável — o usuário re-esconde o que quiser.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-front && npx vitest run src/views/calendar/collaboratorPreferences.spec.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/views/calendar/collaboratorPreferences.ts src/views/calendar/collaboratorPreferences.spec.ts
git commit -m "feat(calendar): preferencia de colaboradores por esconder (agenda nova visivel)"
```

---

## Task 6: Front — usar o util + refresh ao salvar agenda

**Files:**
- Modify: `chatfunnel-front/src/views/calendar/index.vue`
- Modify: `chatfunnel-front/src/views/configuration/integrations/components/configureGoogleCalendars/index.vue`

**Interfaces:**
- Consumes: `loadSelectedCollaborators`, `saveSelectedCollaborators` (Task 5); evento `saved` do `configureGoogleCalendars`.

- [ ] **Step 1: `configureGoogleCalendars` emite `saved`**

Em `configureGoogleCalendars/index.vue`, declarar o emit no `<script setup>` (logo após os imports, antes do `defineExpose`):

```typescript
const emit = defineEmits<{ saved: [] }>()
```

Em `handleSave`, após `await getCalendars()` (dentro do `try`), emitir:

```typescript
    showForm.value = false
    await getCalendars()
    emit('saved')
```

Em `handleDelete`, após `await getCalendars()`:

```typescript
  await getCalendars()
  emit('saved')
```

- [ ] **Step 2: Calendar view escuta `saved` e recarrega**

Em `views/calendar/index.vue`, no template, adicionar o listener no componente (linha ~59):

```html
    <configure-google-calendars ref="calendarSettingsRef" @saved="handleCalendarsChanged" />
```

No `<script setup>`, remover as funções inline `STORAGE_KEY`, `saveCollaboratorPreferences`, `loadCollaboratorPreferences` (bloco atual linhas ~89–112) e importar o util:

```javascript
import {
  loadSelectedCollaborators,
  saveSelectedCollaborators
} from './collaboratorPreferences'
```

Definir o accountId uma vez (perto do `authStore`):

```javascript
const accountId = () => authStore.user?.accountId ?? 'default'
```

Em `loadCollaborators`, no ramo com permissão, usar o util:

```javascript
  if (hasPermission('CALENDAR', 'FILTER_BY_COLLABORATOR_CALENDAR')) {
    collaborators.value = res.data
    const allIds = collaborators.value.map((c) => c.id)
    selectedCollaborators.value = loadSelectedCollaborators(accountId(), allIds)
  } else {
```

Trocar o `watch` de persistência (persistir SÓ quando o usuário tem permissão de filtro — senão o ramo "só a própria agenda" marcaria todas as outras como escondidas e trancaria a visão mesmo depois de ganhar permissão):

```javascript
watch(selectedCollaborators, (ids) => {
  if (!hasPermission('CALENDAR', 'FILTER_BY_COLLABORATOR_CALENDAR')) return
  const allIds = collaborators.value.map((c) => c.id)
  saveSelectedCollaborators(accountId(), ids, allIds)
})
```

Adicionar o handler do `@saved` (perto de `handleColorChanged`):

```javascript
const handleCalendarsChanged = async () => {
  await loadCollaborators()
  await loadEvents()
}
```

- [ ] **Step 3: Typecheck + testes do front**

Run: `cd chatfunnel-front && npx vue-tsc --noEmit && npx vitest run src/views/calendar`
Expected: sem erros de tipo; specs do calendar PASS.

- [ ] **Step 4: Verificação manual (E2E rápida)**

1. `cd chatfunnel-services && npm run start:dev` e `cd chatfunnel-front && npm run dev`.
2. Logar, abrir `/calendar`, clicar em configurar agendas → "Adicionar agenda" → conectar a uma conta Google com eventos existentes → Salvar.
3. Esperado: o dialog fecha, a sidebar de colaboradores mostra a nova agenda **marcada**, e os eventos existentes do Google aparecem na grade sem recarregar a página.
4. Desmarcar a nova agenda, recarregar a página → permanece desmarcada; criar outra agenda → nasce marcada.
5. **Sem** a permissão `FILTER_BY_COLLABORATOR_CALENDAR`: ver só a própria agenda e confirmar que NADA é gravado no `localStorage` (chave `calendar_hidden_collaborators_v2_*` ausente). Ao ganhar a permissão depois, todas as agendas aparecem marcadas.

- [ ] **Step 5: Commit**

```bash
git add src/views/calendar/index.vue src/views/configuration/integrations/components/configureGoogleCalendars/index.vue
git commit -m "feat(calendar): recarrega agendas ao salvar e usa preferencia por esconder"
```

---

## Task 7: Front — exibir eventos de dia inteiro (heurística, sem schema)

**Files:**
- Create: `chatfunnel-front/src/views/calendar/calendarEventMapping.ts`
- Test: `chatfunnel-front/src/views/calendar/calendarEventMapping.spec.ts`
- Modify: `chatfunnel-front/src/views/calendar/index.vue`

**Interfaces:**
- Produces:
  - `deriveAllDay(startISO: string, endISO: string): boolean`.
  - `toFullCalendarEvent(evt: any): any` — adiciona `allDay`; para all-day, converte `start`/`end` para data-only `YYYY-MM-DD` (senão o FullCalendar desloca o dia por fuso).

> **Contexto do problema:** o backfill grava o all-day do Google (`start.date`) como `Date` de meia-noite UTC; ao voltar como ISO com horário e com `allDaySlot: false` + faixa 06:00–22:00, um feriado sumiria da view. Sem campo no schema (proibido nesta entrega), deduzimos `allDay` por heurística.
>
> **Limitação documentada:** um evento TEMPORIZADO exatamente à meia-noite UTC cobrindo dias inteiros seria classificado como all-day. Resolver de forma robusta com campo `isAllDay` no schema (Entrega 2).

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// chatfunnel-front/src/views/calendar/calendarEventMapping.spec.ts
import { describe, expect, it } from 'vitest'
import { deriveAllDay, toFullCalendarEvent } from './calendarEventMapping'

describe('deriveAllDay', () => {
  it('true para span de dias inteiros em meia-noite UTC', () => {
    expect(deriveAllDay('2026-07-21T00:00:00.000Z', '2026-07-22T00:00:00.000Z')).toBe(true)
  })
  it('false para evento com horário', () => {
    expect(deriveAllDay('2026-07-20T17:00:00.000Z', '2026-07-20T18:00:00.000Z')).toBe(false)
  })
  it('false para meia-noite UTC com duração não múltipla de 1 dia', () => {
    expect(deriveAllDay('2026-07-21T00:00:00.000Z', '2026-07-21T12:00:00.000Z')).toBe(false)
  })
})

describe('toFullCalendarEvent', () => {
  it('marca allDay e converte datas para YYYY-MM-DD', () => {
    const out = toFullCalendarEvent({
      id: 'e1',
      title: 'Feriado',
      start: '2026-07-21T00:00:00.000Z',
      end: '2026-07-22T00:00:00.000Z'
    })
    expect(out.allDay).toBe(true)
    expect(out.start).toBe('2026-07-21')
    expect(out.end).toBe('2026-07-22')
  })
  it('mantém evento temporizado intacto com allDay false', () => {
    const out = toFullCalendarEvent({
      id: 'e2',
      start: '2026-07-20T17:00:00.000Z',
      end: '2026-07-20T18:00:00.000Z'
    })
    expect(out.allDay).toBe(false)
    expect(out.start).toBe('2026-07-20T17:00:00.000Z')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-front && npx vitest run src/views/calendar/calendarEventMapping.spec.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar o helper e ligar na view**

Criar o util:

```typescript
// chatfunnel-front/src/views/calendar/calendarEventMapping.ts
const DAY_MS = 24 * 60 * 60 * 1000

function atUtcMidnight(d: Date): boolean {
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  )
}

// Heurística sem campo no schema: "dia inteiro" quando início e fim caem em
// meia-noite UTC e a duração é múltiplo exato de 1 dia (formato que o backfill
// grava a partir de start.date do Google).
export function deriveAllDay(startISO: string, endISO: string): boolean {
  const s = new Date(startISO)
  const e = new Date(endISO)
  const ms = e.getTime() - s.getTime()
  return atUtcMidnight(s) && atUtcMidnight(e) && ms >= DAY_MS && ms % DAY_MS === 0
}

export function toFullCalendarEvent(evt: any): any {
  const allDay = evt?.start && evt?.end ? deriveAllDay(evt.start, evt.end) : false
  if (!allDay) return { ...evt, allDay: false }
  return { ...evt, allDay: true, start: evt.start.slice(0, 10), end: evt.end.slice(0, 10) }
}
```

Em `views/calendar/index.vue`, importar o mapeador:

```javascript
import { toFullCalendarEvent } from './calendarEventMapping'
```

Em `loadEvents`, mapear a resposta:

```javascript
    events.value = res.data.map(toFullCalendarEvent)
```

Habilitar a linha de all-day nas options (trocar `allDaySlot: false` — linha ~207):

```javascript
  allDaySlot: true,
```

Em `renderEventContent`, não mostrar horário para all-day (trocar a 1ª linha do corpo):

```javascript
  const time = arg.event.allDay ? 'Dia todo' : format(arg.event.start, 'HH:mm')
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-front && npx vitest run src/views/calendar/calendarEventMapping.spec.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Verificação manual**

Com uma agenda Google que tenha um feriado (evento de dia inteiro): abrir `/calendar` nas views de semana e mês → o feriado aparece na faixa "dia inteiro" (não some, não vira evento à meia-noite).

- [ ] **Step 6: Commit**

```bash
git add src/views/calendar/calendarEventMapping.ts src/views/calendar/calendarEventMapping.spec.ts src/views/calendar/index.vue
git commit -m "feat(calendar): exibe eventos de dia inteiro (heuristica de meia-noite UTC)"
```

---

## Notas de sequência e handoff

- Tasks 1–4 são backend (`chatfunnel-services`), Tasks 5–7 são front (`chatfunnel-front`) — repos e branches independentes.
- Task 3 depende de Task 1 e 2. Task 2 depende de Task 1. Task 4 é independente. Tasks 5→6 em ordem; Task 7 independente.
- **Custo do `await syncAndWatch`:** no create de agenda nova o banco tem 0 eventos → sem loop de push pro Google (só 1 `listEvents` + upserts + 1 watch): rápido e limitado. Request longo só ocorre no *migrate* (nativa→Google) com muitos eventos locais a empurrar; se virar gargalo, migrar para fire-and-forget + notificação via socket `calendar:updated` (Entrega 2).
- **Fora de escopo (Entrega 2):** alinhar o `findManyByAccountIdAndDateRange` no core; corrigir `collaboratorId: cal.userId` → `cal.id` no `chatfunnel-core/src/services/calendar/handlers/update-event.handler.ts:86` (contrato divergente de create/list — evento editado sai do filtro do front e afeta consumidores otimistas como o mobile); campo `isAllDay` no schema para representar dia-inteiro de forma robusta (a Entrega 1 usa heurística de meia-noite-UTC no front — ver Task 7); `syncToken`/sync incremental; ampliar janela do webhook (hoje `now-24h..now+30d`); status observável de sync + retry (delete externo hoje só faz `console.error`); integrar ou remover `WatchSingleCalendarHandler` (código morto no core).

## Self-Review

- **Cobertura da análise:** item 1 (sync no create) → Tasks 1–3; item 2 (all-day: import no back → Task 1; exibição no front → Task 7); item 3 (overlap semiaberto) → Task 4; item 5 (refresh no front) → Task 6 (emit `saved` + `handleCalendarsChanged`); item 6 (agenda nova visível + persistir só com permissão) → Tasks 5–6. ✔
- **Revisão incorporada:** all-day agora tem exibição + teste real (Task 7) e limitação documentada; persistência de preferência protegida por permissão (Task 6); overlap semiaberto `lt/gt` (Task 4); testes de idempotência/cancelado/sem-data/falha-`listEvents` (Task 1); nota da chave `v2` (Task 5); custo do `await` documentado; commits só sob pedido explícito (Global Constraints). ✔
- **Placeholders:** nenhum — todo passo com código/comando concretos. ✔
- **Consistência de tipos:** `syncAndWatch({ calendarId, accountId, googleConnectionId, googleCalendarId })` idêntico nas Tasks 1/2/3; construtores de create/update batem com as chamadas em `google_calendars.service.ts`; `loadSelectedCollaborators`/`saveSelectedCollaborators` batem entre Task 5 e Task 6; `deriveAllDay`/`toFullCalendarEvent` batem entre Task 7 e `index.vue`. ✔
