# Re-sincronização Manual de Agenda Google — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o usuário force a importação (Google → banco) dos eventos de uma agenda já configurada, via um botão "Sincronizar eventos", sem remover/recriar a agenda e sem depender do webhook (push) nem do cron de 6h. A sincronização importa novos, atualiza existentes, trata cancelados como exclusão lógica (`isCancelled=true` + `cancelledAt`), cancela seus lembretes pendentes, renova o watch só quando necessário e retorna contagens reais (ou erro).

**Architecture:** O `GoogleCalendarApiService.listEvents` passa a aceitar `showDeleted`, permitindo que o Google devolva cancelamentos explícitos. Um método novo `CalendarSyncService.resyncFromGoogle(calendar)` faz **somente Google → banco** (sem `pushLocalToGoogle`), difere do `syncAndWatch` legado e usa `markCancelled` + `cancelByEventId` para exclusão lógica. Um command handler `SyncGoogleCalendarHandler` lê a agenda, valida que é do Google e delega. Expõe via `POST /nest/google_calendars/:id/resync`, retornando `{ imported, updated, cancelled, watchRenewed }`. No front, um item no dropdown de ações dispara a rota com toast de progresso (item desabilitado durante a chamada) e emite `resynced`, que faz a view do calendário chamar só `loadEvents()`.

**Tech Stack:** TypeScript + Google APIs (`chatfunnel-core`); NestJS 10 + SWC (services), Jest; Vue 3 + `<script setup lang="ts">` + vue-sonner + Phosphor Icons (front).

## Global Constraints

- **Branch:** trabalhar direto na branch atual **`fix-release/calendar`** nos três repos (`chatfunnel-core`, `chatfunnel-services` e `chatfunnel-front`). **Não criar branch nova e não fazer commits** — o usuário commita manualmente ao final.
- **Services** usa **double quotes + semicolons** (`.prettierrc`); front usa **single quotes, sem semicolons** (`.prettierrc.json`).
- Todas as rotas do services têm prefixo global **`/nest`** (o front chama via `NestApi`, que já injeta a base).
- **Multi-tenancy:** toda query passa `accountId`. Nunca conectar/rodar Prisma direto — usar repositories existentes.
- **Rotas literais antes de parametrizadas** nos controllers NestJS.
- **Front:** ícones **`@phosphor-icons/vue`** em código novo (nunca Lucide). Preferir componentes de `@/components/ui`. Erros HTTP são tratados globalmente pelo interceptor Axios — usar `showToastPromise` do `useAlerts` para o fluxo assíncrono.
- Feature nova **sempre em `chatfunnel-services`** (nunca na API Express).
- **Validação:** `npm run lint` usa `--fix` (altera arquivos, não é gate puro) e o build do Services é SWC (não faz typecheck completo). O build do Core usa `tsc`; depois dele, sincronizar o `dist` para os consumidores com o script oficial `sync-core.ps1`. Confiar nos **testes Jest** para o backend e no `npm run typecheck` (vue-tsc) para o front.

## Limitações conhecidas (fora do escopo deste v1)

- **Paginação (teto 250):** `GoogleCalendarApiService.listEvents` limita a 250 eventos por chamada e não pagina. Manter o teto no v1; paginação completa fica como follow-up. **Por isso não fazemos reconciliação "evento sumiu do Google → cancela"** (seria incorreta sob o teto): com `showDeleted: true`, só excluímos logicamente eventos que o Google retornar explicitamente com `status === "cancelled"`.

---

## File Structure

**Core (`chatfunnel-core`):**
- Modify: `src/services/calendar/google-calendar-api.service.ts` — opção `showDeleted` no `listEvents`.

**Backend (`chatfunnel-services`):**
- Modify: `src/modules/google_calendars/services/calendar-sync.service.ts` — novo método `resyncFromGoogle` + helper `renewWatchIfNeeded`.
- Test: `src/modules/google_calendars/services/calendar-sync.service.spec.ts` — testes do `resyncFromGoogle` (arquivo já existe; adicionar `describe`).
- Modify: `src/modules/google_calendars/google_calendars.module.ts` — registrar o repositório de lembretes usado pelo sync.
- Create: `src/modules/google_calendars/commands/sync/handler.ts` — command handler.
- Create: `src/modules/google_calendars/commands/sync/index.ts` — re-export.
- Test: `src/modules/google_calendars/commands/sync/handler.spec.ts` — testes do handler.
- Modify: `src/modules/google_calendars/services/google_calendars.service.ts` — método `resync`.
- Modify: `src/modules/google_calendars/controllers/google_calendars.controller.ts` — rota `POST /:id/resync`.

**Front (`chatfunnel-front`):**
- Modify: `src/common/services/OrganizationsService.js` — método `resyncGoogleCalendar`.
- Modify: `src/views/configuration/integrations/components/configureGoogleCalendars/index.vue` — item de dropdown (com estado de loading) + handler + `defineEmits`.
- Modify: `src/views/calendar/index.vue` — ligar `@resynced="loadEvents"`.

---

## Task 0: Core — permitir listar cancelamentos explícitos

**Files:**
- Modify: `chatfunnel-core/src/services/calendar/google-calendar-api.service.ts`

**Objetivo:** permitir que o resync manual solicite ao Google eventos com `status === "cancelled"`, sem alterar o comportamento dos consumidores atuais.

- [ ] **Step 1: Expandir as opções de `listEvents`**

Alterar o tipo de `options`:

```ts
options?: { query?: string; maxResults?: number; showDeleted?: boolean },
```

E incluir na chamada `calendar.events.list`:

```ts
showDeleted: options?.showDeleted ?? false,
```

O default `false` preserva o comportamento atual. O resync manual será o único consumidor inicial com `showDeleted: true`.

- [ ] **Step 2: Compilar e sincronizar o Core**

O usuario faz a compilaçao do core e sincronizaçao manualmente

Aguardar o usuario fazer



## Task 1: Backend — `CalendarSyncService.resyncFromGoogle` (Google → banco) + testes

**Files:**
- Modify: `chatfunnel-services/src/modules/google_calendars/services/calendar-sync.service.ts`
- Test: `chatfunnel-services/src/modules/google_calendars/services/calendar-sync.service.spec.ts`

**Interfaces:**
- Consumes (todos já usados neste service — mesmas assinaturas):
  - `googleConnectionsRepository.findById(googleConnectionId, accountId) => Promise<{ id, tokens } | null>`
  - `googleCalendarApiService.getAuthenticatedClient(tokens, connectionId, googleConnectionsRepository) => Promise<auth>`
  - `googleCalendarApiService.listEvents(auth, googleCalendarId, timeMinISO, timeMaxISO, { showDeleted: true }) => Promise<any[]>` (itens crus do Google: `{ id, summary, description, start:{dateTime|date}, end:{dateTime|date}, status, hangoutLink }`, teto 250)
  - `googleCalendarEventsRepository.findManyByAccountIdAndDateRange(accountId, start: Date, end: Date, [calendarId]) => Promise<any[]>` (itens do banco com `id`, `googleEventId`, `isCancelled`)
  - `googleCalendarEventsRepository.upsertByGoogleEventId(googleEventId, data) => Promise<any>` (insere OU atualiza pelo `googleEventId`)
  - `googleCalendarEventsRepository.markCancelled(id) => Promise<void>` (exclusão lógica: `isCancelled=true`, `cancelledAt=now`)
  - `googleCalendarEventScheduledRemindersRepository.cancelByEventId(id) => Promise<BatchPayload>` (cancela lembretes `PENDING` do evento)
  - `googleCalendarApiService.stopWatchCalendar(auth, watchGoogleId, watchResourceId) => Promise<void>`
  - `googleCalendarApiService.watchCalendar(auth, googleCalendarId, channelId) => Promise<{ resourceId, expiration }>`
  - `googleCalendarsRepository.updateWatchFields(calendarId, { watchGoogleId, watchResourceId, watchExpiry }) => Promise<void>`
- Produces:
  - `CalendarSyncService.resyncFromGoogle(calendar: any) => Promise<ResyncResult>` onde `calendar` tem `id, accountId, googleConnectionId, calendarId, watchExpiry, watchGoogleId, watchResourceId`.
  - `ResyncResult = { imported: number; updated: number; cancelled: number; watchRenewed: boolean }`.
  - Evento cancelado no Google é **excluído logicamente**, nunca removido fisicamente: mantém ID interno e vínculos, deixa de aparecer nas queries (`isCancelled=false`) e tem lembretes pendentes cancelados.
  - **Lança** `Error` quando `findById` não acha a conexão ou quando `listEvents` do Google falha (falha real de sincronização). Falha só na renovação do watch é **não-fatal** (`watchRenewed: false`).

- [ ] **Step 1: Escrever os testes que falham**

Modify `calendar-sync.service.spec.ts` — adicionar no fim do arquivo um novo bloco `describe`. Mocks mínimos (mesmo estilo dos testes existentes):

```ts
describe("CalendarSyncService.resyncFromGoogle", () => {
  const baseCalendar = {
    id: "cal-1",
    accountId: "acc-1",
    googleConnectionId: "conn-1",
    calendarId: "primary",
    watchExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    watchGoogleId: "chan-old",
    watchResourceId: "res-old",
  };

  const makeService = (overrides: any = {}) => {
    const googleCalendarsRepository: any = {
      updateWatchFields: jest.fn().mockResolvedValue(undefined),
    };
    const googleCalendarEventsRepository: any = {
      findManyByAccountIdAndDateRange: jest
        .fn()
        .mockResolvedValue(overrides.dbEvents ?? []),
      upsertByGoogleEventId: jest.fn().mockResolvedValue(undefined),
      markCancelled: jest.fn().mockResolvedValue(undefined),
    };
    const googleCalendarEventScheduledRemindersRepository: any = {
      cancelByEventId: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const googleConnectionsRepository: any = {
      findById: jest.fn().mockResolvedValue({ id: "conn-1", tokens: {} }),
    };
    const googleCalendarApiService: any = {
      getAuthenticatedClient: jest.fn().mockResolvedValue({}),
      listEvents: jest.fn().mockResolvedValue(overrides.googleEvents ?? []),
      stopWatchCalendar: jest.fn().mockResolvedValue(undefined),
      watchCalendar: jest
        .fn()
        .mockResolvedValue({ resourceId: "res-new", expiration: "9999999999999" }),
    };
    const service = new (require("./calendar-sync.service").CalendarSyncService)(
      googleCalendarsRepository,
      googleCalendarEventsRepository,
      googleConnectionsRepository,
      googleCalendarApiService,
      googleCalendarEventScheduledRemindersRepository,
    );
    return {
      service,
      googleCalendarEventsRepository,
      googleCalendarEventScheduledRemindersRepository,
      googleCalendarApiService,
      googleConnectionsRepository,
    };
  };

  it("importa novos, atualiza existentes e marca cancelados", async () => {
    const {
      service,
      googleCalendarEventsRepository,
      googleCalendarEventScheduledRemindersRepository,
      googleCalendarApiService,
    } = makeService({
      dbEvents: [
        { id: "db-1", googleEventId: "g-existing", isCancelled: false },
        { id: "db-2", googleEventId: "g-cancel", isCancelled: false },
      ],
      googleEvents: [
        {
          id: "g-new",
          summary: "Novo",
          start: { dateTime: "2026-07-16T09:00:00Z" },
          end: { dateTime: "2026-07-16T10:00:00Z" },
        },
        {
          id: "g-existing",
          summary: "Atualizado",
          start: { dateTime: "2026-07-16T11:00:00Z" },
          end: { dateTime: "2026-07-16T12:00:00Z" },
        },
        { id: "g-cancel", status: "cancelled" },
      ],
    });

    const res = await service.resyncFromGoogle(baseCalendar);

    expect(res.imported).toBe(1);
    expect(res.updated).toBe(1);
    expect(res.cancelled).toBe(1);
    expect(googleCalendarApiService.listEvents).toHaveBeenCalledWith(
      {},
      "primary",
      expect.any(String),
      expect.any(String),
      { showDeleted: true },
    );
    expect(googleCalendarEventsRepository.upsertByGoogleEventId).toHaveBeenCalledTimes(2);
    expect(googleCalendarEventsRepository.markCancelled).toHaveBeenCalledWith("db-2");
    expect(
      googleCalendarEventScheduledRemindersRepository.cancelByEventId,
    ).toHaveBeenCalledWith("db-2");
  });

  it("lança quando a listagem do Google falha (sem watch)", async () => {
    const { service, googleCalendarApiService } = makeService();
    googleCalendarApiService.listEvents.mockRejectedValueOnce(new Error("google down"));

    await expect(service.resyncFromGoogle(baseCalendar)).rejects.toThrow("google down");
  });

  it("não renova watch quando ainda está longe do vencimento", async () => {
    const { service, googleCalendarApiService } = makeService();
    const res = await service.resyncFromGoogle(baseCalendar);
    expect(googleCalendarApiService.watchCalendar).not.toHaveBeenCalled();
    expect(res.watchRenewed).toBe(false);
  });

  it("renova watch (parando o antigo) quando vencido, sem falhar o resync se der erro", async () => {
    const { service, googleCalendarApiService } = makeService();
    const expired = { ...baseCalendar, watchExpiry: new Date(Date.now() - 1000).toISOString() };
    googleCalendarApiService.watchCalendar.mockRejectedValueOnce(new Error("localhost"));

    const res = await service.resyncFromGoogle(expired);

    expect(googleCalendarApiService.stopWatchCalendar).toHaveBeenCalledWith(
      {},
      "chan-old",
      "res-old",
    );
    expect(res.watchRenewed).toBe(false); // falha de watch é não-fatal
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run (de dentro de `chatfunnel-services`): `npm test -- src/modules/google_calendars/services/calendar-sync.service.spec.ts`
Expected: FAIL — `resyncFromGoogle is not a function`.

- [ ] **Step 3: Injetar o repositório de lembretes**

Modify `calendar-sync.service.ts` — importar:

```ts
import { GoogleCalendarEventScheduledRemindersRepository } from "src/database/repositories/google_calendar_event_scheduled_reminders.repository";
```

Adicionar como última dependência do construtor:

```ts
private readonly googleCalendarEventScheduledRemindersRepository: GoogleCalendarEventScheduledRemindersRepository,
```

Atualizar também o `makeService` do `describe("CalendarSyncService.syncAndWatch")` já existente para passar um mock de `GoogleCalendarEventScheduledRemindersRepository` como quinto argumento. Mesmo que o fluxo legado não use esse repositório, todos os testes devem construir o service com a assinatura completa.

Modify `google_calendars.module.ts` — importar o mesmo repositório e adicioná-lo ao array `providers`.

- [ ] **Step 4: Implementar `resyncFromGoogle` + `renewWatchIfNeeded`**

Modify `calendar-sync.service.ts` — adicionar o tipo de retorno perto do topo (após a interface `SyncContext`):

```ts
interface ResyncResult {
  imported: number;
  updated: number;
  cancelled: number;
  watchRenewed: boolean;
}
```

E adicionar os dois métodos dentro da classe (após `syncAndWatch`, antes de `loadContext`):

```ts
  // Re-sincronização manual: SOMENTE Google -> banco (sem pushLocalToGoogle).
  // Importa novos, atualiza existentes (upsert) e marca cancelados. Renova o
  // watch só quando ausente/perto de vencer. Lança em falha real de
  // auth/listagem; falha na renovação do watch é não-fatal.
  // Limitação: teto de 250 eventos herdado do core.listEvents; sem paginação e
  // sem reconciliar "sumiu do Google" (só status=cancelled). Upgrade: paginar
  // no core e usar syncToken para detectar remoções.
  async resyncFromGoogle(calendar: any): Promise<ResyncResult> {
    const internalCalendarId = calendar.id;
    const googleCalendarId = calendar.calendarId;
    const { accountId, googleConnectionId } = calendar;

    const connection = await this.googleConnectionsRepository.findById(
      googleConnectionId,
      accountId,
    );
    if (!connection) {
      throw new Error("Conexão do Google não encontrada");
    }

    const auth = await this.googleCalendarApiService.getAuthenticatedClient(
      connection.tokens,
      connection.id,
      this.googleConnectionsRepository,
    );

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const oneYearAhead = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    // Falha aqui é falha real de sincronização -> propaga.
    const googleEvents: any[] = await this.googleCalendarApiService.listEvents(
      auth,
      googleCalendarId,
      startOfToday.toISOString(),
      oneYearAhead.toISOString(),
      { showDeleted: true },
    );

    const dbEvents =
      (await this.googleCalendarEventsRepository.findManyByAccountIdAndDateRange(
        accountId,
        startOfToday,
        oneYearAhead,
        [internalCalendarId],
      )) as any[];
    const dbByGoogleId = new Map<string, any>(
      dbEvents.filter((e) => e.googleEventId).map((e) => [e.googleEventId, e]),
    );

    let imported = 0;
    let updated = 0;
    let cancelled = 0;

    for (const gEvt of googleEvents) {
      if (!gEvt.id) continue;

      if (gEvt.status === "cancelled") {
        const existing = dbByGoogleId.get(gEvt.id);
        if (existing && !existing.isCancelled) {
          await this.googleCalendarEventsRepository.markCancelled(existing.id);
          await this.googleCalendarEventScheduledRemindersRepository.cancelByEventId(
            existing.id,
          );
          cancelled++;
        }
        continue;
      }

      const gStart = gEvt.start?.dateTime ?? gEvt.start?.date;
      const gEnd = gEvt.end?.dateTime ?? gEvt.end?.date;
      if (!gStart || !gEnd) continue;

      const existed = dbByGoogleId.has(gEvt.id);
      await this.googleCalendarEventsRepository.upsertByGoogleEventId(gEvt.id, {
        googleEventId: gEvt.id,
        accountId,
        googleCalendarId: internalCalendarId,
        title: gEvt.summary ?? "",
        description: gEvt.description ?? null,
        startAt: new Date(gStart),
        endAt: new Date(gEnd),
        meetingLink: gEvt.hangoutLink ?? null,
      });
      if (existed) updated++;
      else imported++;
    }

    const watchRenewed = await this.renewWatchIfNeeded(auth, calendar);

    return { imported, updated, cancelled, watchRenewed };
  }

  // Renova o watch só se ausente ou vencendo em < 24h; encerra o canal anterior
  // antes. Nunca lança (no localhost o watchCalendar falha porque o Google não
  // alcança a máquina) — retorna false e o resync segue válido.
  private async renewWatchIfNeeded(
    auth: any,
    calendar: any,
  ): Promise<boolean> {
    const expiryThreshold = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const needsRenewal =
      !calendar.watchExpiry ||
      new Date(calendar.watchExpiry) < expiryThreshold;
    if (!needsRenewal) return false;

    try {
      if (calendar.watchGoogleId && calendar.watchResourceId) {
        try {
          await this.googleCalendarApiService.stopWatchCalendar(
            auth,
            calendar.watchGoogleId,
            calendar.watchResourceId,
          );
        } catch (err: any) {
          this.logger.error(`Falha ao encerrar watch anterior: ${err.message}`);
        }
      }

      const channelId = uuidv4();
      const watch = await this.googleCalendarApiService.watchCalendar(
        auth,
        calendar.calendarId,
        channelId,
      );
      await this.googleCalendarsRepository.updateWatchFields(calendar.id, {
        watchGoogleId: channelId,
        watchResourceId: watch.resourceId!,
        watchExpiry: new Date(Number(watch.expiration)),
      });
      return true;
    } catch (err: any) {
      this.logger.error(`Falha ao renovar watch no resync: ${err.message}`);
      return false;
    }
  }
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npm test -- src/modules/google_calendars/services/calendar-sync.service.spec.ts`
Expected: PASS — os 4 novos testes verdes + os já existentes de `syncAndWatch`.

---

## Task 2: Backend — `SyncGoogleCalendarHandler` (validação + delegação) + testes

**Files:**
- Create: `chatfunnel-services/src/modules/google_calendars/commands/sync/handler.ts`
- Create: `chatfunnel-services/src/modules/google_calendars/commands/sync/index.ts`
- Test: `chatfunnel-services/src/modules/google_calendars/commands/sync/handler.spec.ts`

**Interfaces:**
- Consumes:
  - `GoogleCalendarsRepository.findByIdAndAccountId(id, accountId) => Promise<any | null>` (retorna o registro com `provider`, `googleConnectionId`, `calendarId`, campos de watch).
  - `CalendarSyncService.resyncFromGoogle(calendar) => Promise<ResyncResult>` (Task 1).
  - `CommandHandler<T>` base — `execute` re-lança `BadRequestException`/`Error`.
- Produces:
  - `SyncGoogleCalendarHandler(googleCalendarsRepository, calendarSync)` com `execute(accountId: string, id: string) => Promise<ResyncResult>`.

- [ ] **Step 1: Escrever o teste que falha**

Create `commands/sync/handler.spec.ts`:

```ts
import { SyncGoogleCalendarHandler } from "./handler";
import { BadRequestException } from "@nestjs/common";

describe("SyncGoogleCalendarHandler", () => {
  const makeDeps = (calendar: any) => {
    const calendarsRepo: any = {
      findByIdAndAccountId: jest.fn().mockResolvedValue(calendar),
    };
    const calendarSync: any = {
      resyncFromGoogle: jest
        .fn()
        .mockResolvedValue({ imported: 2, updated: 1, cancelled: 0, watchRenewed: false }),
    };
    const handler = new SyncGoogleCalendarHandler(calendarsRepo, calendarSync);
    return { handler, calendarsRepo, calendarSync };
  };

  it("delega para resyncFromGoogle e retorna o resultado", async () => {
    const calendar = {
      id: "cal-1",
      provider: "GOOGLE",
      googleConnectionId: "conn-1",
      calendarId: "primary",
    };
    const { handler, calendarSync } = makeDeps(calendar);

    const res = await handler.execute("acc-1", "cal-1");

    expect(calendarSync.resyncFromGoogle).toHaveBeenCalledWith(calendar);
    expect(res).toEqual({ imported: 2, updated: 1, cancelled: 0, watchRenewed: false });
  });

  it("lança BadRequest quando a agenda não existe", async () => {
    const { handler, calendarSync } = makeDeps(null);
    await expect(handler.execute("acc-1", "cal-x")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(calendarSync.resyncFromGoogle).not.toHaveBeenCalled();
  });

  it("lança BadRequest para agenda nativa (sem conexão Google)", async () => {
    const { handler, calendarSync } = makeDeps({
      id: "cal-2",
      provider: "NATIVE",
      googleConnectionId: null,
      calendarId: null,
    });
    await expect(handler.execute("acc-1", "cal-2")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(calendarSync.resyncFromGoogle).not.toHaveBeenCalled();
  });

  it("lança BadRequest quando provider != GOOGLE mesmo com campos preenchidos", async () => {
    const { handler, calendarSync } = makeDeps({
      id: "cal-3",
      provider: "NATIVE",
      googleConnectionId: "conn-1",
      calendarId: "primary",
    });
    await expect(handler.execute("acc-1", "cal-3")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(calendarSync.resyncFromGoogle).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/modules/google_calendars/commands/sync/handler.spec.ts`
Expected: FAIL — `Cannot find module "./handler"`.

- [ ] **Step 3: Implementar o handler**

Create `commands/sync/handler.ts`:

```ts
import { CommandHandler } from "src/core/command.handler";
import { BadRequestException } from "@nestjs/common";
import { GoogleCalendarsRepository } from "src/database/repositories/google_calendars.repository";
import { CalendarSyncService } from "src/modules/google_calendars/services/calendar-sync.service";

export class SyncGoogleCalendarHandler extends CommandHandler<{
  imported: number;
  updated: number;
  cancelled: number;
  watchRenewed: boolean;
}> {
  constructor(
    private readonly googleCalendarsRepository: GoogleCalendarsRepository,
    private readonly calendarSync: CalendarSyncService,
  ) {
    super();
  }

  async handler(accountId: string, id: string) {
    const calendar = (await this.googleCalendarsRepository.findByIdAndAccountId(
      id,
      accountId,
    )) as any;

    if (!calendar) {
      throw new BadRequestException("Agenda não encontrada");
    }

    // Validação no backend (não confiar na UI esconder o botão). Exige provider
    // GOOGLE alinhado com os campos — evita resync de agenda inconsistente.
    if (
      calendar.provider !== "GOOGLE" ||
      !calendar.googleConnectionId ||
      !calendar.calendarId
    ) {
      throw new BadRequestException(
        "Somente agendas do Google podem ser sincronizadas",
      );
    }

    return this.calendarSync.resyncFromGoogle(calendar);
  }
}
```

- [ ] **Step 4: Criar o re-export**

Create `commands/sync/index.ts`:

```ts
export { SyncGoogleCalendarHandler } from "./handler";
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `npm test -- src/modules/google_calendars/commands/sync/handler.spec.ts`
Expected: PASS — 4 testes verdes.

---

## Task 3: Backend — método `resync` no service + rota no controller

**Files:**
- Modify: `chatfunnel-services/src/modules/google_calendars/services/google_calendars.service.ts`
- Modify: `chatfunnel-services/src/modules/google_calendars/controllers/google_calendars.controller.ts`

**Interfaces:**
- Consumes: `SyncGoogleCalendarHandler` (Task 2); `this.googleCalendarsRepository` e `this.calendarSync` já injetados no service.
- Produces:
  - `GoogleCalendarsService.resync(accountId, id) => Promise<ResyncResult>`.
  - Rota `POST /nest/google_calendars/:id/resync` (guards `AuthGuard("jwt")` + `ModeratorAuthGuard`, header `Account-Selected`).

- [ ] **Step 1: Importar o handler no service**

Modify `services/google_calendars.service.ts` — após `import { GetGoogleCalendarByIdHandler } from "../commands/get_by_id";`:

```ts
import { SyncGoogleCalendarHandler } from "../commands/sync";
```

- [ ] **Step 2: Adicionar o método `resync` no service**

Modify `services/google_calendars.service.ts` — após o método `update(...)` (antes do `}` final da classe):

```ts
  async resync(accountId: string, id: string) {
    return new SyncGoogleCalendarHandler(
      this.googleCalendarsRepository,
      this.calendarSync,
    ).execute(accountId, id);
  }
```

- [ ] **Step 3: Adicionar a rota no controller**

Modify `controllers/google_calendars.controller.ts` — inserir logo após o método `create(...)`:

```ts
  @Post("/:id/resync")
  @ApiBearerAuth()
  @UseGuards(AuthGuard("jwt"), ModeratorAuthGuard)
  async resync(
    @Headers("Account-Selected") accountId: string,
    @Param("id") id: string,
  ) {
    return this.googleCalendarsService.resync(accountId, id);
  }
```

- [ ] **Step 4: Rodar a suíte do módulo (garante fiação e nada quebrado)**

Run (de dentro de `chatfunnel-services`): `npm test -- src/modules/google_calendars`
Expected: PASS — inclui os testes das Tasks 1 e 2 e os já existentes de create/update.

---

## Task 4: Front — método `resyncGoogleCalendar` no service

**Files:**
- Modify: `chatfunnel-front/src/common/services/OrganizationsService.js`

**Interfaces:**
- Consumes: rota `POST /google_calendars/:id/resync` (Task 3). `NestApi.post()` retorna `post(link, form, showError = true)`.
- Produces: `OrganizationService.resyncGoogleCalendar(id: string) => Promise<AxiosResponse<ResyncResult>>` com `showError = false` (o `showToastPromise` no componente é a única fonte de feedback de erro).

- [ ] **Step 1: Adicionar o método no objeto do service**

Modify `OrganizationsService.js` — logo após `updateGoogleCalendar(id, body) { ... },`:

```js
  resyncGoogleCalendar: (id) => {
    return NestApi.post()(`/google_calendars/${id}/resync`, {}, false);
  },
```

- [ ] **Step 2: Verificar que não há erro de sintaxe no arquivo**

Run (de dentro de `chatfunnel-front`): `npm run typecheck`
Expected: sem novos erros (o arquivo é `.js`, mas `allowJs` no tsconfig valida sintaxe/uso).

---

## Task 5: Front — badge de sincronização + ação "Sincronizar eventos" no dialog de agendas

**Files:**
- Modify: `chatfunnel-front/src/views/configuration/integrations/components/configureGoogleCalendars/index.vue`

**Interfaces:**
- Consumes: `OrganizationService.resyncGoogleCalendar(id)` (Task 4); `showToastPromise` do `useAlerts` (já destructurado).
- Produces:
  - Badge **"Sincronização necessária"** ao lado do nome da agenda Google quando `watchExpiry` estiver ausente ou expirado.
  - Novo emit `resynced` (além do `saved` existente).
  - `handleResync(id: string) => Promise<void>` — desabilita o item durante a chamada (via `resyncingId`), recarrega a listagem para atualizar o badge e emite `resynced` no sucesso.

- [ ] **Step 1: Importar o ícone Phosphor**

Modify `configureGoogleCalendars/index.vue` — após `import { CalendarPlus, MoreVertical, Pencil, Trash2 } from 'lucide-vue-next'`:

```ts
import { PhArrowsClockwise } from '@phosphor-icons/vue'
```

- [ ] **Step 2: Declarar o emit `resynced` e o estado de loading**

Modify o `defineEmits` existente (`const emit = defineEmits<{ saved: [] }>()`) para:

```ts
const emit = defineEmits<{ saved: []; resynced: [] }>()
```

E adicionar, junto aos demais `ref` de estado (perto de `const isSaving = ref(false)`):

```ts
const resyncingId = ref<string | null>(null)
```

- [ ] **Step 3: Adicionar a regra e o badge de sincronização necessária**

Adicionar no `<script setup>`:

```ts
const needsSynchronization = (calendar: GoogleCalendarItem) => {
  if (calendar.provider !== 'GOOGLE') return false
  if (!calendar.watchExpiry) return true

  const watchExpiry = new Date(calendar.watchExpiry)
  return Number.isNaN(watchExpiry.getTime()) || watchExpiry.getTime() <= Date.now()
}
```

Se `GoogleCalendarItem` ainda não declarar `watchExpiry`, adicionar `watchExpiry?: string | null` ao tipo usado pelo componente.

Alterar o slot `#item.name` para mostrar o badge ao lado do nome:

```html
            <template #item.name="{ row }">
              <div class="flex items-center gap-2">
                <span>{{ row.item.name || 'Agenda padrão' }}</span>
                <Badge
                  v-if="needsSynchronization(row.item)"
                  color="warning"
                  hierarchy="outlined"
                  size="sm"
                >
                  Sincronização necessária
                </Badge>
              </div>
            </template>
```

O badge indica apenas ausência, valor inválido ou expiração efetiva do watch. Watch válido que vence em menos de 24h não exibe alerta: ele ainda está funcional e será renovado preventivamente pelo resync.

- [ ] **Step 4: Adicionar o item no dropdown de ações**

Modify o `<DropdownMenuContent>` da coluna `#item.action` — inserir como primeiro item, antes do "Editar":

```html
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      v-if="row.item.provider === 'GOOGLE'"
                      :disabled="resyncingId !== null"
                      @click.stop="handleResync(row.item.id)"
                    >
                      <PhArrowsClockwise :size="14" />
                      {{ resyncingId === row.item.id ? 'Sincronizando...' : 'Sincronizar eventos' }}
                    </DropdownMenuItem>
                    <DropdownMenuItem @click.stop="handleEdit(row.item.id)">
                      <Pencil :size="14" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      @click.stop="handleDelete(row.item.id)"
                    >
                      <Trash2 :size="14" />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
```

- [ ] **Step 5: Adicionar o handler no `<script setup>`**

Modify `configureGoogleCalendars/index.vue` — adicionar logo após `handleDelete` (antes de `// ─── Public API ───`):

```ts
const handleResync = async (id: string) => {
  if (resyncingId.value) return
  resyncingId.value = id
  try {
    await showToastPromise(OrganizationService.resyncGoogleCalendar(id), {
      loading: 'Sincronizando eventos do Google...',
      success: 'Eventos sincronizados com sucesso',
      error: 'Não foi possível sincronizar os eventos',
    })
    await getCalendars()
    emit('resynced')
  } finally {
    resyncingId.value = null
  }
}
```

- [ ] **Step 6: Verificar typecheck**

Run (de dentro de `chatfunnel-front`): `npm run typecheck`
Expected: sem erros de tipo no arquivo.

---

## Task 6: Front — recarregar só os eventos ao receber `resynced`

**Files:**
- Modify: `chatfunnel-front/src/views/calendar/index.vue`

**Interfaces:**
- Consumes: novo emit `resynced` do `<configure-google-calendars>` (Task 5); `loadEvents()` já existe na view.
- Produces: `@resynced="loadEvents"` no template (recarrega só eventos, sem re-buscar colaboradores/slots que o resync não altera).

> Observação: o `@saved="handleCalendarsSaved"` (que já chama `loadCollaborators` + `loadCalendarSlots` + `loadEvents`) permanece para o fluxo de add/edit/delete. O `resynced` é o caminho leve, só para o resync.

- [ ] **Step 1: Ligar o novo evento no template**

Modify `calendar/index.vue` — na linha do componente:

De:

```html
    <configure-google-calendars ref="calendarSettingsRef" @saved="handleCalendarsSaved"/>
```

Para:

```html
    <configure-google-calendars
        ref="calendarSettingsRef"
        @saved="handleCalendarsSaved"
        @resynced="loadEvents"
    />
```

- [ ] **Step 2: Verificação manual (fim-a-fim)**

Run (de dentro de `chatfunnel-front`): `npm run dev` (com o `chatfunnel-services` rodando)
Passos no navegador:
1. Abrir o Calendário → configurações (engrenagem) → dialog "Configuração de Agendas".
2. Numa agenda **Google Calendar**, menu de ações (⋮) → **Sincronizar eventos**.
3. Durante a chamada, o item mostra "Sincronizando..." e fica desabilitado (sem cliques duplos).
4. Toast "Sincronizando eventos do Google..." → "Eventos sincronizados com sucesso".
5. Agenda Google sem `watchExpiry`, com valor inválido ou expirado mostra o badge **"Sincronização necessária"** ao lado do nome.
6. Após sincronizar e renovar o watch com sucesso, a listagem é recarregada e o badge desaparece.
7. Fechar o dialog → eventos novos/atualizados aparecem sem refresh (marcar o colaborador na sidebar se estiver desmarcado).
8. Cancelar um evento no Google, sincronizar novamente e confirmar que ele desaparece da view sem perder os demais eventos.

Expected: toast de sucesso; eventos refletidos; cancelados tratados como exclusão lógica e lembretes pendentes cancelados. Em agenda **Nativa** o item não aparece. Simular erro (ex.: derrubar a conexão Google) → toast de erro e nenhuma alteração.

---

## Self-Review

**1. Cobertura do escopo + feedback do Codex:**
- Import manual sem recriar agenda / sem cron: Tasks 0-6. ✅
- **Sucesso falso (Codex #1):** `resyncFromGoogle` propaga erro de auth/listagem; handler retorna contagens reais. ✅
- **Watch duplicado (#2):** `renewWatchIfNeeded` só renova se ausente/vencendo em <24h e encerra o canal anterior antes. ✅
- **Só Google→banco (#3):** `resyncFromGoogle` não chama `pushLocalToGoogle`. ✅
- **Atualizar existentes / cancelados (#4):** `upsertByGoogleEventId` para ativos; `showDeleted: true` permite receber cancelamentos explícitos; `status=cancelled` → `markCancelled` + `cancelByEventId`, sem hard delete. ✅
- **Paginação (#5):** documentada como limitação; reconciliação de eventos ausentes não é feita sob o teto de 250. ⚠️ (follow-up no core)
- **Task 6 void (race):** removida — create/update seguem com `await`. ✅
- **Botão desabilitado durante sync:** `resyncingId` desabilita todas as ações de resync enquanto houver uma chamada em andamento (Task 5). ✅
- **Evento leve `resynced` → só `loadEvents`:** Task 6. ✅
- **Lint --fix / build SWC não valida tipos:** Core validado por `tsc` no build, backend por Jest e front por `npm run typecheck`. ✅

**2. Placeholders:** nenhum. Todo passo com código/comando completo.

**3. Consistência de tipos/nomes:**
- `resyncFromGoogle(calendar) => { imported, updated, cancelled, watchRenewed }` — Task 1 (def), Task 2 (uso/mocks), Task 5 (toast/label). ✅
- Cancelamento lógico usa os métodos reais `markCancelled(eventId)` e `cancelByEventId(eventId)`; nenhum `updateById` tenta persistir `isCancelled`. ✅
- `SyncGoogleCalendarHandler(googleCalendarsRepository, calendarSync)` / `execute(accountId, id)` — Task 2 (def) e Task 3 (uso). ✅
- `resyncGoogleCalendar(id)` — Task 4 (def), Task 5 (uso). ✅
- Emit `resynced` — Task 5 (declara/emite), Task 6 (escuta). ✅
- Rota `POST /google_calendars/:id/resync` — Task 3 (controller) e Task 4 (front). ✅

**Notas de risco:**
- No **localhost** o `watchCalendar` falha (webhook não alcança a máquina); por isso a renovação é não-fatal e o import não depende dela.
- O teto de 250 impede considerar como cancelado um evento apenas porque ele não apareceu na resposta. Somente `status=cancelled` retornado com `showDeleted: true` gera exclusão lógica.
- Auto-seleção de colaboradores recém-adicionados (agenda nova entra desmarcada por prefs no localStorage) continua **fora do escopo**.
