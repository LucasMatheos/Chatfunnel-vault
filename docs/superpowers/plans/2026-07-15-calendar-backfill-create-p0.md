# P0 — Backfill de eventos ao criar agenda Google (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar task por task. Steps usam checkbox (`- [ ]`).

**Goal:** Ao criar uma agenda já conectada ao Google, importar os eventos existentes para o banco e registrar o watch imediatamente — para que apareçam na view de calendário sem esperar o cron de 6h nem uma alteração futura.

**Architecture:** A sincronização bidirecional + watch já existe, trancada como método privado do `UpdateGoogleCalendarHandler`. Extraímos para um `CalendarSyncService` idempotente (services), fazemos o update delegar a ele, e o `CreateGoogleCalendarHandler` passa a chamá-lo quando a agenda conecta ao Google. Backend puro — nada de front, overlap ou schema nesta entrega.

**Tech Stack:** NestJS 10 + SWC + Jest; Prisma via `@chatfunnel/core` (sem edição/rebuild do core).

## Global Constraints

- Só `chatfunnel-services`. NENHUMA edição em `chatfunnel-core`.
- NENHUMA migration / `prisma migrate` / `db push`.
- `accountId` em toda query (multi-tenancy).
- Double quotes + semicolons (Prettier do services).
- Logging de lógica de negócio via `Logger` do `@nestjs/common` (`new Logger(ClassName.name)`), que é o padrão predominante nos módulos modernos do Services. Passar `err.stack` como segundo argumento em erros quando disponível. O `LoggerHelper`/Winston fica reservado aos fluxos que exigem arquivos rotacionados por conta; `console.*` fica restrito a bootstrap/observabilidade antes do Nest e não deve ser usado neste serviço.
- Strings user-facing em pt-BR acentuado.
- Git: branch `fix-release/calendar`; NUNCA commit em `main`/`release`; NUNCA `Co-Authored-By`. Os passos de commit só rodam quando o usuário pedir **explicitamente** — por padrão, NÃO commitar.

## Escopo

- **Inclui:** extração do `CalendarSyncService`; refactor do `UpdateGoogleCalendarHandler` para delegar; `CreateGoogleCalendarHandler` chama `syncAndWatch` quando `!isNative`; watch imediato. O import já aceita evento com horário e de dia inteiro (`dateTime ?? date`) porque é a lógica correta de import — mas a **exibição** de all-day no front NÃO faz parte deste P0.
- **Fora do P0 (próximas prioridades):** overlap no filtro de datas; exibição de all-day no front; refresh/preferências no front; `syncToken`/janela do webhook; alinhar core.

---

## File Structure

- Create: `src/modules/google_calendars/services/calendar-sync.service.ts` — `CalendarSyncService`.
- Create: `src/modules/google_calendars/services/calendar-sync.service.spec.ts` — testes do sync.
- Modify: `src/modules/google_calendars/google_calendars.module.ts` — registra `CalendarSyncService` e `GoogleCalendarApiService`.
- Modify: `src/modules/google_calendars/services/google_calendars.service.ts` — injeta e repassa o service.
- Modify: `src/modules/google_calendars/commands/update/handler.ts` — delega sync/stopWatch.
- Modify: `src/modules/google_calendars/commands/create/handler.ts` — chama `syncAndWatch` no create Google.
- Create: `src/modules/google_calendars/commands/create/handler.spec.ts` — teste do create.

---

## Task 1: `CalendarSyncService` (extração)

**Files:**
- Create: `chatfunnel-services/src/modules/google_calendars/services/calendar-sync.service.ts`
- Test: `chatfunnel-services/src/modules/google_calendars/services/calendar-sync.service.spec.ts`

**Interfaces:**
- Consumes: repos do services (`GoogleCalendarsRepository`, `GoogleCalendarEventsRepository`, `GoogleConnectionsRepository`) e `GoogleCalendarApiService` de `@chatfunnel/core/services`. Métodos já existentes: `googleConnectionsRepository.findById(id, accountId)`, `apiService.getAuthenticatedClient(tokens, connectionId, connectionsRepo)`, `apiService.listEvents(auth, calendarId, timeMinIso, timeMaxIso)`, `apiService.createEvent(auth, calendarId, {summary,description,start,end})`, `apiService.watchCalendar(auth, calendarId, channelId)` → `{ resourceId, expiration }`, `apiService.stopWatchCalendar(auth, watchGoogleId, watchResourceId)`, `eventsRepository.findManyByAccountIdAndDateRange(accountId, start, end, [calId])`, `eventsRepository.upsertByGoogleEventId(googleEventId, data)`, `eventsRepository.updateById(id, {googleEventId})`, `calendarsRepository.updateWatchFields(id, {...})`, `calendarsRepository.clearWatchFields(id)`, `calendarsRepository.findByIdAndAccountId(id, accountId)`.
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
    expect(importedIds).toContain("g-allday");
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

    expect(api.createEvent).not.toHaveBeenCalled();
    expect(upsertByGoogleEventId).not.toHaveBeenCalled();
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

  it("não faz push nem quebra quando listEvents falha (evita duplicatas) e ainda registra o watch", async () => {
    const { service, updateWatchFields, api } = makeService({
      dbEvents: [
        {
          id: "db-1",
          googleEventId: null,
          startAt: new Date("2026-07-20T17:00:00Z"),
          endAt: new Date("2026-07-20T18:00:00Z"),
          isCancelled: false,
        },
      ],
      apiOverrides: {
        listEvents: jest.fn().mockRejectedValue(new Error("Google down")),
      },
    });

    await expect(service.syncAndWatch(params)).resolves.toBeUndefined();
    expect(api.createEvent).not.toHaveBeenCalled(); // não reenvia p/ Google
    expect(updateWatchFields).toHaveBeenCalledTimes(1); // watch ainda registra
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
import { Injectable, Logger } from "@nestjs/common";
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

  private readonly logger = new Logger(CalendarSyncService.name);

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
      let googleListSucceeded = false;
      try {
        googleEvents = await this.googleCalendarApiService.listEvents(
          auth,
          googleCalendarId,
          startOfToday.toISOString(),
          oneYearAhead.toISOString(),
        );
        googleListSucceeded = true;
      } catch (err: any) {
        this.logger.error(
          `Falha ao listar eventos do Google (calendar ${calendarId}): ${err.message}`,
          err.stack,
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

      // 1. Push banco -> Google — SÓ quando a listagem do Google teve sucesso.
      // Se a listagem falhou, googleEvents=[] faria todos os eventos locais
      // parecerem ausentes no Google e serem reenviados, criando duplicatas.
      if (googleListSucceeded) {
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
            this.logger.error(
              `Falha ao enviar evento "${evt.title}" ao Google: ${err.message}`,
              err.stack,
            );
          }
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
          this.logger.error(
            `Falha ao importar evento "${gEvt.summary}" do Google: ${err.message}`,
            err.stack,
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
        this.logger.error(`Falha ao registrar watch: ${err.message}`, err.stack);
      }
    } catch (err: any) {
      this.logger.error(`syncAndWatch falhou: ${err.message}`, err.stack);
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
        this.logger.error(`Google stopWatch error: ${err.message}`, err.stack);
      }

      await this.googleCalendarsRepository.clearWatchFields(calendarId);
    } catch (err: any) {
      this.logger.error(`stopWatch falhou: ${err.message}`, err.stack);
    }
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd chatfunnel-services && npx jest src/modules/google_calendars/services/calendar-sync.service.spec.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit** (só se o usuário pedir)

```bash
git add src/modules/google_calendars/services/calendar-sync.service.ts src/modules/google_calendars/services/calendar-sync.service.spec.ts
git commit -m "feat(calendar): extrai CalendarSyncService (sync + watch)"
```

---

## Task 2: Wiring + refactor do update handler

**Files:**
- Modify: `chatfunnel-services/src/modules/google_calendars/google_calendars.module.ts`
- Modify: `chatfunnel-services/src/modules/google_calendars/services/google_calendars.service.ts`
- Modify: `chatfunnel-services/src/modules/google_calendars/commands/update/handler.ts`

**Interfaces:**
- Consumes: `CalendarSyncService` (Task 1) — `syncAndWatch(params)`, `stopWatch(calendarId, googleConnectionId, accountId)`.
- Produces: `UpdateGoogleCalendarHandler` com construtor `(googleCalendarsRepository, googleCalendarAvailableSlotsRepository, googleCalendarSubscribersRepository, accountsRepository, calendarSync)`.

- [ ] **Step 1: Registrar providers no módulo**

Em `google_calendars.module.ts`, adicionar os imports:

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

- [ ] **Step 2: Injetar no `GoogleCalendarsService` e repassar aos handlers**

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

Atualizar `create()`:

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

Atualizar `update()` (novo construtor — remove events/connections repos, adiciona calendarSync):

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

Em `commands/update/handler.ts`, substituir os imports do topo (remover `GoogleCalendarApiService`, `uuidv4`, `GoogleCalendarEventsRepository`, `GoogleConnectionsRepository`; `moment` continua) e adicionar `CalendarSyncService`:

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

Apagar os métodos privados `syncCalendar(...)` e `stopWatch(...)` inteiros (antigas linhas 161–355).

- [ ] **Step 4: Verificar que compila e os testes existentes passam**

Run: `cd chatfunnel-services && npx tsc --noEmit -p tsconfig.json && npx jest src/modules/google_calendars`
Expected: sem erros de tipo; specs de `google_calendars` continuam PASS.

- [ ] **Step 5: Commit** (só se o usuário pedir)

```bash
git add src/modules/google_calendars/google_calendars.module.ts src/modules/google_calendars/services/google_calendars.service.ts src/modules/google_calendars/commands/update/handler.ts
git commit -m "refactor(calendar): update handler delega ao CalendarSyncService"
```

---

## Task 3: Backfill + watch no create de agenda Google

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
    return { handler, calendarSync, connectionsRepo };
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

  it("NÃO dispara sync nem consulta Google para agenda nativa", async () => {
    const { handler, calendarSync, connectionsRepo } = makeDeps();
    await handler.execute("acc-1", { ...baseDto });
    expect(calendarSync.syncAndWatch).not.toHaveBeenCalled();
    expect(connectionsRepo.findById).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd chatfunnel-services && npx jest src/modules/google_calendars/commands/create/handler.spec.ts`
Expected: FAIL — o construtor atual não recebe `calendarSync`.

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

Substituir o `return` final por sincronizar antes de retornar quando conectou ao Google:

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

- [ ] **Step 5: Verificação manual (E2E rápida)**

1. `cd chatfunnel-services && npm run start:dev`.
2. Criar uma agenda conectada a uma conta Google com eventos existentes (via UI ou `POST /nest/google_calendars`).
3. Conferir no banco que `google_calendar_events` recebeu os eventos e que `google_calendars.watchGoogleId`/`watchExpiry` foram preenchidos.
4. Abrir `/calendar` no front → os eventos com horário aparecem na janela atual.

- [ ] **Step 6: Commit** (só se o usuário pedir)

```bash
git add src/modules/google_calendars/commands/create/handler.ts src/modules/google_calendars/commands/create/handler.spec.ts
git commit -m "fix(calendar): backfill + watch ao criar agenda ja conectada ao Google"
```

---

## Notas

- Ordem: Task 1 → Task 2 → Task 3.
- **Custo do `await syncAndWatch`:** no create de agenda nova o banco tem 0 eventos → sem loop de push pro Google (só 1 `listEvents` + upserts + 1 watch): rápido e limitado.
- **Depois deste P0** (plano completo em `docs/superpowers/plans/2026-07-15-calendar-google-sync-delivery-1.md`): overlap no filtro de datas, exibição de all-day no front, refresh/preferências no front, e a robustez da Entrega 2.

## Self-Review

- **Cobertura do P0:** extrair `CalendarSyncService` → Task 1; chamar `syncAndWatch` no create → Task 3; watch imediato → Task 1 (passo 3 do service) disparado por Task 3. ✔
- **Placeholders:** nenhum — todo passo com código/comando concretos. ✔
- **Consistência de tipos:** `syncAndWatch({ calendarId, accountId, googleConnectionId, googleCalendarId })` idêntico nas Tasks 1/2/3; construtores batem com as chamadas em `google_calendars.service.ts`. ✔
