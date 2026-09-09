# Calendar — Sync de Exclusões via syncToken (Google Calendar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer com que exclusões (e cancelamentos) de eventos no Google Calendar sejam refletidas no banco (`isCancelled: true`), substituindo a listagem por janela de tempo do webhook por sincronização incremental com `syncToken`.

**Architecture:** O webhook do Google não carrega dados — só sinaliza "a agenda mudou". Hoje o handler puxa eventos por janela `timeMin/timeMax`, modo em que a Google API **não retorna** itens excluídos, então `isCancelled` nunca vira `true`. A correção adiciona um método de client paginado (`listEventsPage`) que suporta `syncToken`; o handler passa a fazer full sync inicial (janela + reconciliação por ausência para limpar fantasmas históricos) e, nas chamadas seguintes, incremental sync via `syncToken` — modo em que o Google entrega itens deletados como `status: 'cancelled'`. O avanço do cursor (`syncToken`) é protegido por compare-and-set (CAS) na coluna, dispensando lock distribuído (que não existe no projeto). `410 GONE` invalida o token condicionalmente e refaz full sync.

**Tech Stack:** TypeScript (chatfunnel-core), Prisma (PostgreSQL), googleapis v148, Jest + @swc/jest.

## Global Constraints

- Toda a mudança vive em `chatfunnel-core` (feature nova → services/core, nunca na API Express). Regra do workspace.
- Branch e commits ficam por conta do usuário — o plano não troca de branch nem commita. (Regra do sub-repo: NUNCA commitar em `master`/`main`/`release`.)
- Multi-tenancy: todo acesso a dados passa `accountId`. Soft delete via `isCancelled: true` (não deletar linha).
- Banco: **proibido** conectar, ler, escrever, ou rodar `prisma migrate`/`db push`/`db execute`. A migration é **gerada e aplicada pelo usuário** — o plano só altera o `schema.prisma`. `prisma generate` (sem DB) é permitido para atualizar tipos.
- Build (`tsc`) é rodado **pelo usuário**, manualmente. Não rodar `npm run build` automaticamente. Os testes rodam sob `@swc/jest` (sem type-check), então independem do `prisma generate`.
- `listEvents()` legado **não muda** de assinatura (consumido por `calendar-sync.service.ts` de migração + spec). Toda paginação vai num método novo `listEventsPage()`.
- Nunca tocar eventos NATIVE (`googleEventId == null`) em nenhum caminho de cancelamento/reconciliação.
- Janela do full sync: `timeMin = now - 24h`, `timeMax = now + 1 ano` (convenção do `calendar-sync.service.ts`). NÃO usar `timeMax` ilimitado (expansão descontrolada de recorrências). Teto: eventos a >1 ano só sincronizam num re-seed; upgrade = limpar `syncToken` na renovação do watch (cron 6h) para a janela deslizar.

---

## File Structure

- `chatfunnel-core/src/services/calendar/google-calendar-api.service.ts` — **Modify**: adiciona `listEventsPage()`. `listEvents()` legado intacto.
- `chatfunnel-core/src/services/calendar/google-calendar-api.service.spec.ts` — **Create**: contrato de `listEventsPage()`.
- `chatfunnel-core/prisma/schema.prisma` — **Modify**: `GoogleCalendars.syncToken String?`. (A migration é gerada/aplicada pelo usuário; o plano não escreve SQL.)
- `chatfunnel-core/src/repositories/google_calendars.repository.ts` — **Modify**: `casSyncToken()`.
- `chatfunnel-core/src/repositories/google_calendar_events.repository.ts` — **Modify**: `findByGoogleEventIdScoped()`, `findActiveGoogleEventsInRange()`.
- `chatfunnel-core/src/repositories/google_calendars.repository.spec.ts` — **Create**: CAS.
- `chatfunnel-core/src/repositories/google_calendar_events.repository.spec.ts` — **Create**: finders novos.
- `chatfunnel-core/src/services/calendar/handlers/handle-webhook.handler.ts` — **Modify**: reescrita do fluxo (full/incremental/reconcile/410/CAS).
- `chatfunnel-core/src/services/calendar/handlers/handle-webhook.handler.spec.ts` — **Create**: comportamento via `execute()`.
- `vault/wiki/features/calendar-sync-google.md` — **Modify**: marcar gotcha resolvido.

---

## Task 1: Client `listEventsPage()` (contrato paginado)

**Files:**
- Modify: `chatfunnel-core/src/services/calendar/google-calendar-api.service.ts`
- Test: `chatfunnel-core/src/services/calendar/google-calendar-api.service.spec.ts`

**Interfaces:**
- Consumes: `google.calendar('v3').events.list` (googleapis).
- Produces:
  ```ts
  listEventsPage(
    auth: OAuth2Client,
    calendarId: string,
    params: { syncToken?: string | null; pageToken?: string | null; timeMin?: string; timeMax?: string },
  ): Promise<{ items: calendar_v3.Schema$Event[]; nextPageToken: string | null; nextSyncToken: string | null }>
  ```
  Regra: se `params.syncToken` presente → manda `{ syncToken, pageToken?, singleEvents:true, maxResults:250 }` (SEM `timeMin/timeMax/showDeleted/orderBy` — API proíbe com syncToken). Senão → `{ timeMin, timeMax, pageToken?, singleEvents:true, showDeleted:true, maxResults:250 }`.

- [ ] **Step 1: Criar o spec com o contrato (falha)**

Create `chatfunnel-core/src/services/calendar/google-calendar-api.service.spec.ts`:

```ts
import { google } from "googleapis";
import { GoogleCalendarApiService } from "./google-calendar-api.service";

jest.mock("googleapis", () => ({
  google: { calendar: jest.fn(), auth: { OAuth2: jest.fn() } },
}));

const makeList = (data: any) => {
  const list = jest.fn().mockResolvedValue({ data });
  (google.calendar as jest.Mock).mockReturnValue({ events: { list } });
  return list;
};

describe("GoogleCalendarApiService.listEventsPage", () => {
  const auth = {} as any;

  it("com syncToken → envia syncToken e NÃO envia timeMin/timeMax/showDeleted", async () => {
    const list = makeList({ items: [{ id: "a" }], nextPageToken: "p1", nextSyncToken: null });
    const service = new GoogleCalendarApiService();

    const res = await service.listEventsPage(auth, "primary", { syncToken: "tok", pageToken: "p0" });

    const arg = list.mock.calls[0][0];
    expect(arg.syncToken).toBe("tok");
    expect(arg.pageToken).toBe("p0");
    expect(arg.singleEvents).toBe(true);
    expect(arg.timeMin).toBeUndefined();
    expect(arg.timeMax).toBeUndefined();
    expect(arg.showDeleted).toBeUndefined();
    expect(res).toEqual({ items: [{ id: "a" }], nextPageToken: "p1", nextSyncToken: null });
  });

  it("sem syncToken → envia timeMin/timeMax + showDeleted:true", async () => {
    const list = makeList({ items: [], nextPageToken: null, nextSyncToken: "s9" });
    const service = new GoogleCalendarApiService();

    const res = await service.listEventsPage(auth, "primary", {
      timeMin: "2026-01-01T00:00:00.000Z",
      timeMax: "2026-02-01T00:00:00.000Z",
    });

    const arg = list.mock.calls[0][0];
    expect(arg.timeMin).toBe("2026-01-01T00:00:00.000Z");
    expect(arg.timeMax).toBe("2026-02-01T00:00:00.000Z");
    expect(arg.showDeleted).toBe(true);
    expect(arg.singleEvents).toBe(true);
    expect(arg.syncToken).toBeUndefined();
    expect(res.nextSyncToken).toBe("s9");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd chatfunnel-core && npx jest google-calendar-api.service.spec -t listEventsPage`
Expected: FAIL — `service.listEventsPage is not a function`.

- [ ] **Step 3: Implementar `listEventsPage`**

In `google-calendar-api.service.ts`, adicionar o método logo após `listEvents` (linha ~68), sem tocar em `listEvents`:

```ts
  async listEventsPage(
    auth: OAuth2Client,
    calendarId: string,
    params: {
      syncToken?: string | null;
      pageToken?: string | null;
      timeMin?: string;
      timeMax?: string;
    },
  ): Promise<{
    items: calendar_v3.Schema$Event[];
    nextPageToken: string | null;
    nextSyncToken: string | null;
  }> {
    const calendar = google.calendar({ version: "v3", auth });
    const base: calendar_v3.Params$Resource$Events$List = {
      calendarId,
      singleEvents: true,
      maxResults: 250,
      ...(params.pageToken ? { pageToken: params.pageToken } : {}),
    };
    const req: calendar_v3.Params$Resource$Events$List = params.syncToken
      ? { ...base, syncToken: params.syncToken }
      : { ...base, timeMin: params.timeMin, timeMax: params.timeMax, showDeleted: true };
    const res = await calendar.events.list(req);
    return {
      items: res.data.items ?? [],
      nextPageToken: res.data.nextPageToken ?? null,
      nextSyncToken: res.data.nextSyncToken ?? null,
    };
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd chatfunnel-core && npx jest google-calendar-api.service.spec -t listEventsPage`
Expected: PASS (2 testes).

---

## Task 2: Schema `syncToken` (migration gerada pelo usuário)

**Files:**
- Modify: `chatfunnel-core/prisma/schema.prisma` (model `GoogleCalendars`)

**Interfaces:**
- Produces: coluna `GoogleCalendars.syncToken` (String? / TEXT null) e o campo no Prisma Client após `prisma generate`. Consumido pelo `casSyncToken` (Task 3) e pelo handler (Tasks 4-6).

- [ ] **Step 1: Adicionar o campo ao schema**

In `chatfunnel-core/prisma/schema.prisma`, no model `GoogleCalendars`, logo após o bloco `watchExpiry DateTime?`:

```prisma
  watchGoogleId   String?
  watchResourceId String?
  watchExpiry     DateTime?
  syncToken       String?
```

- [ ] **Step 2: Regenerar o Prisma Client (sem DB)**

Run: `cd chatfunnel-core && npm run prisma:generate`
Expected: "Generated Prisma Client" sem erro. (Isto NÃO acessa o banco nem aplica migration.)

- [ ] **Step 3: Migration — o usuário gera e aplica**

Não escrever SQL nem rodar `prisma migrate` aqui. O usuário gera a migration (`prisma migrate dev --name add_google_calendars_sync_token` ou equivalente) e aplica manualmente. Só o schema muda neste plano.

---

## Task 3: Repository methods — CAS e finders escopados

**Files:**
- Modify: `chatfunnel-core/src/repositories/google_calendars.repository.ts`
- Modify: `chatfunnel-core/src/repositories/google_calendar_events.repository.ts`
- Test: `chatfunnel-core/src/repositories/google_calendars.repository.spec.ts` (Create)
- Test: `chatfunnel-core/src/repositories/google_calendar_events.repository.spec.ts` (Create)

**Interfaces:**
- Consumes: `PrismaClient` (mockado nos testes).
- Produces:
  ```ts
  // GoogleCalendarsRepository
  casSyncToken(id: string, accountId: string, expected: string | null, next: string | null): Promise<number>
  // GoogleCalendarEventsRepository
  findByGoogleEventIdScoped(accountId: string, googleCalendarId: string, googleEventId: string): Promise<{ id: string } | null>
  findActiveGoogleEventsInRange(accountId: string, googleCalendarId: string, timeMin: Date, timeMax: Date): Promise<{ id: string; googleEventId: string }[]>
  ```

- [ ] **Step 1: Teste do `casSyncToken` (falha)**

Create `chatfunnel-core/src/repositories/google_calendars.repository.spec.ts`:

```ts
import { GoogleCalendarsRepository } from "./google_calendars.repository";

const makePrisma = (count: number) => ({
  googleCalendars: { updateMany: jest.fn().mockResolvedValue({ count }) },
}) as any;

describe("GoogleCalendarsRepository.casSyncToken", () => {
  it("filtra por id+accountId+syncToken esperado e retorna count", async () => {
    const prisma = makePrisma(1);
    const repo = new GoogleCalendarsRepository(prisma);

    const n = await repo.casSyncToken("cal-1", "acc-1", "old", "new");

    expect(n).toBe(1);
    expect(prisma.googleCalendars.updateMany).toHaveBeenCalledWith({
      where: { id: "cal-1", accountId: "acc-1", syncToken: "old" },
      data: { syncToken: "new" },
    });
  });

  it("expected null → where.syncToken null (IS NULL); count 0 quando perde o CAS", async () => {
    const prisma = makePrisma(0);
    const repo = new GoogleCalendarsRepository(prisma);

    const n = await repo.casSyncToken("cal-1", "acc-1", null, "new");

    expect(n).toBe(0);
    expect(prisma.googleCalendars.updateMany).toHaveBeenCalledWith({
      where: { id: "cal-1", accountId: "acc-1", syncToken: null },
      data: { syncToken: "new" },
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd chatfunnel-core && npx jest google_calendars.repository.spec`
Expected: FAIL — `repo.casSyncToken is not a function`.

- [ ] **Step 3: Implementar `casSyncToken`**

In `google_calendars.repository.ts`, adicionar após `clearWatchFields` (linha ~100):

```ts
  async casSyncToken(
    id: string,
    accountId: string,
    expected: string | null,
    next: string | null,
  ): Promise<number> {
    const res = await this.prisma.googleCalendars.updateMany({
      where: { id, accountId, syncToken: expected },
      data: { syncToken: next },
    });
    return res.count;
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd chatfunnel-core && npx jest google_calendars.repository.spec`
Expected: PASS (2 testes).

- [ ] **Step 5: Teste dos finders novos (falha)**

Create `chatfunnel-core/src/repositories/google_calendar_events.repository.spec.ts`:

```ts
import { GoogleCalendarEventsRepository } from "./google_calendar_events.repository";

describe("GoogleCalendarEventsRepository — finders de sync", () => {
  it("findByGoogleEventIdScoped usa a unique tripla accountId+googleCalendarId+googleEventId", async () => {
    const prisma = {
      googleCalendarEvents: { findUnique: jest.fn().mockResolvedValue({ id: "evt-1" }) },
    } as any;
    const repo = new GoogleCalendarEventsRepository(prisma);

    const res = await repo.findByGoogleEventIdScoped("acc-1", "cal-1", "gid-1");

    expect(res).toEqual({ id: "evt-1" });
    expect(prisma.googleCalendarEvents.findUnique).toHaveBeenCalledWith({
      where: {
        accountId_googleCalendarId_googleEventId: {
          accountId: "acc-1",
          googleCalendarId: "cal-1",
          googleEventId: "gid-1",
        },
      },
      select: { id: true },
    });
  });

  it("findActiveGoogleEventsInRange filtra por agenda, googleEventId != null, isCancelled false e janela", async () => {
    const prisma = {
      googleCalendarEvents: {
        findMany: jest.fn().mockResolvedValue([{ id: "e1", googleEventId: "g1" }]),
      },
    } as any;
    const repo = new GoogleCalendarEventsRepository(prisma);
    const min = new Date("2026-01-01T00:00:00.000Z");
    const max = new Date("2026-02-01T00:00:00.000Z");

    const res = await repo.findActiveGoogleEventsInRange("acc-1", "cal-1", min, max);

    expect(res).toEqual([{ id: "e1", googleEventId: "g1" }]);
    expect(prisma.googleCalendarEvents.findMany).toHaveBeenCalledWith({
      where: {
        accountId: "acc-1",
        googleCalendarId: "cal-1",
        googleEventId: { not: null },
        isCancelled: false,
        endAt: { gt: min },
        startAt: { lt: max },
      },
      select: { id: true, googleEventId: true },
    });
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `cd chatfunnel-core && npx jest google_calendar_events.repository.spec`
Expected: FAIL — métodos não existem.

- [ ] **Step 7: Implementar os finders**

In `google_calendar_events.repository.ts`, adicionar após `findByGoogleEventId` (linha ~280):

```ts
  async findByGoogleEventIdScoped(
    accountId: string,
    googleCalendarId: string,
    googleEventId: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.googleCalendarEvents.findUnique({
      where: {
        accountId_googleCalendarId_googleEventId: {
          accountId,
          googleCalendarId,
          googleEventId,
        },
      },
      select: { id: true },
    });
  }

  async findActiveGoogleEventsInRange(
    accountId: string,
    googleCalendarId: string,
    timeMin: Date,
    timeMax: Date,
  ): Promise<{ id: string; googleEventId: string }[]> {
    // Espelha a semântica do events.list: timeMin filtra pelo FIM do evento, timeMax
    // pelo INÍCIO (ambos exclusivos). Garante que o conjunto local ⊆ janela do Google
    // → nunca cancelamos por engano um evento que o Google só não devolveu por estar
    // fora da janela (inclusive o caso de borda startAt == timeMax).
    return this.prisma.googleCalendarEvents.findMany({
      where: {
        accountId,
        googleCalendarId,
        googleEventId: { not: null },
        isCancelled: false,
        endAt: { gt: timeMin },
        startAt: { lt: timeMax },
      },
      select: { id: true, googleEventId: true },
    }) as unknown as Promise<{ id: string; googleEventId: string }[]>;
  }
```

- [ ] **Step 8: Rodar e ver passar**

Run: `cd chatfunnel-core && npx jest google_calendar_events.repository.spec`
Expected: PASS (2 testes).

---

## Task 4: Handler — reescrita do fluxo + branch cancelled/ativo + paginação

**Files:**
- Modify: `chatfunnel-core/src/services/calendar/handlers/handle-webhook.handler.ts` (reescrita completa)
- Test: `chatfunnel-core/src/services/calendar/handlers/handle-webhook.handler.spec.ts` (Create)

**Interfaces:**
- Consumes: `GoogleCalendarApiService.listEventsPage` (Task 1); `GoogleCalendarsRepository.casSyncToken` (Task 3); `GoogleCalendarEventsRepository.findByGoogleEventIdScoped`, `findActiveGoogleEventsInRange`, `markCancelled`, `upsertByGoogleEventId`.
- Produces: `HandleWebhookHandler.execute(channelId, resourceState, channelToken)` com o novo fluxo. Construtor **inalterado** (mesmos 4 args de hoje). Métodos privados: `syncCalendar`, `fullSync`, `incrementalSync`, `paginate`, `applyEvent`, `reconcile`, `isGone`, `notifyFrontend`.

- [ ] **Step 1: Reescrever o handler inteiro**

Replace o conteúdo de `handle-webhook.handler.ts` por:

```ts
import { GoogleCalendarsRepository } from '../../../repositories/google_calendars.repository';
import { GoogleCalendarEventsRepository } from '../../../repositories/google_calendar_events.repository';
import { GoogleConnectionsRepository } from '../../../repositories/google_connections.repository';
import { GoogleCalendarApiService } from '../google-calendar-api.service';
import { OAuth2Client } from 'google-auth-library';
import { calendar_v3 } from 'googleapis';
import axios from 'axios';

const WINDOW_PAST_MS = 24 * 60 * 60 * 1000;
// +1 ano (convenção do calendar-sync.service). ponytail: eventos a >1a no futuro só
// sincronizam num re-seed; upgrade = limpar syncToken na renovação do watch (cron 6h).
const WINDOW_FUTURE_MS = 365 * 24 * 60 * 60 * 1000;

export class HandleWebhookHandler {
  constructor(
    private readonly googleCalendarsRepository: GoogleCalendarsRepository,
    private readonly googleCalendarEventsRepository: GoogleCalendarEventsRepository,
    private readonly googleConnectionsRepository: GoogleConnectionsRepository,
    private readonly googleCalendarApiService: GoogleCalendarApiService,
  ) {}

  async execute(
    channelId: string,
    resourceState: string,
    channelToken: string,
  ): Promise<void> {
    if (channelToken !== process.env.GOOGLE_WEBHOOK_CHANNEL_TOKEN) return;

    const cals = await this.googleCalendarsRepository.findAllWithCalendarId({
      googleConnection: true,
    });
    const target = (cals as any[]).find((c) => c.watchGoogleId === channelId);
    if (!target) return;

    // Handshake 'sync': normalmente ignorado. MAS se a agenda ainda não tem
    // syncToken, usamos o handshake para semear o token (full sync inicial) —
    // assim agendas novas/renovadas inicializam sem esperar a próxima mudança.
    if (resourceState === 'sync' && target.syncToken) return;

    try {
      const auth = await this.googleCalendarApiService.getAuthenticatedClient(
        target.googleConnection.tokens,
        target.googleConnection.id,
        this.googleConnectionsRepository,
      );
      await this.syncCalendar(target, auth);
      await this.notifyFrontend(target.accountId);
    } catch (err: any) {
      console.error('Webhook handler error:', err.message);
    }
  }

  private isGone(err: any): boolean {
    return err?.code === 410 || err?.response?.status === 410;
  }

  private async persistToken(
    target: any,
    expected: string | null,
    nextSyncToken: string | null,
  ): Promise<void> {
    if (!nextSyncToken) {
      // Paginou até o fim mas o Google não devolveu nextSyncToken → inconsistência.
      // Não avançar o cursor em silêncio; próximo webhook refaz o ciclo.
      console.warn(
        `Calendar sync sem nextSyncToken (agenda ${target.id}); cursor não avançado.`,
      );
      return;
    }
    // CAS: só avança se o cursor ainda for o esperado. count 0 → outro ciclo já
    // avançou; encerra em silêncio (as escritas de evento são idempotentes).
    await this.googleCalendarsRepository.casSyncToken(
      target.id,
      target.accountId,
      expected,
      nextSyncToken,
    );
  }

  private async syncCalendar(target: any, auth: OAuth2Client): Promise<void> {
    const tokenRead: string | null = target.syncToken ?? null;
    if (!tokenRead) {
      await this.fullSync(target, auth);
      return;
    }
    try {
      await this.incrementalSync(target, auth, tokenRead);
    } catch (err: any) {
      if (!this.isGone(err)) throw err;
      // 410: token invalidado pelo Google. Limpa de forma CONDICIONAL — só faz full
      // sync quem realmente invalidou. Se outro processo já avançou, count === 0.
      const cleared = await this.googleCalendarsRepository.casSyncToken(
        target.id,
        target.accountId,
        tokenRead,
        null,
      );
      if (cleared === 1) {
        await this.fullSync(target, auth);
      }
    }
  }

  private async paginate(
    auth: OAuth2Client,
    calendarId: string,
    base: { syncToken?: string; timeMin?: string; timeMax?: string },
  ): Promise<{ items: calendar_v3.Schema$Event[]; nextSyncToken: string | null }> {
    const items: calendar_v3.Schema$Event[] = [];
    let pageToken: string | null = null;
    let nextSyncToken: string | null = null;
    do {
      const page = await this.googleCalendarApiService.listEventsPage(auth, calendarId, {
        ...base,
        pageToken,
      });
      items.push(...page.items);
      pageToken = page.nextPageToken;
      nextSyncToken = page.nextSyncToken;
    } while (pageToken);
    return { items, nextSyncToken };
  }

  private async applyEvent(
    target: any,
    evt: calendar_v3.Schema$Event,
  ): Promise<void> {
    if (!evt.id) return;
    if (evt.status === 'cancelled') {
      // Tombstone: chega só com id + status, sem start/end. NÃO construir datas.
      const local = await this.googleCalendarEventsRepository.findByGoogleEventIdScoped(
        target.accountId,
        target.id,
        evt.id,
      );
      if (local) await this.googleCalendarEventsRepository.markCancelled(local.id);
      return;
    }
    // Evento ativo sem datas não deve virar Invalid Date no banco (fronteira de
    // dados externos — validação obrigatória).
    const start = evt.start?.dateTime ?? evt.start?.date;
    const end = evt.end?.dateTime ?? evt.end?.date;
    if (!start || !end) return;
    await this.googleCalendarEventsRepository.upsertByGoogleEventId(evt.id, {
      googleEventId: evt.id,
      accountId: target.accountId,
      googleCalendarId: target.id,
      title: evt.summary ?? '',
      description: evt.description ?? '',
      startAt: new Date(start),
      endAt: new Date(end),
      meetingLink: evt.hangoutLink ?? null,
      isCancelled: false,
    });
  }

  private async incrementalSync(
    target: any,
    auth: OAuth2Client,
    tokenRead: string,
  ): Promise<void> {
    const { items, nextSyncToken } = await this.paginate(auth, target.calendarId, {
      syncToken: tokenRead,
    });
    for (const evt of items) await this.applyEvent(target, evt);
    await this.persistToken(target, tokenRead, nextSyncToken);
  }

  private async fullSync(target: any, auth: OAuth2Client): Promise<void> {
    const timeMin = new Date(Date.now() - WINDOW_PAST_MS).toISOString();
    const timeMax = new Date(Date.now() + WINDOW_FUTURE_MS).toISOString();
    const { items, nextSyncToken } = await this.paginate(auth, target.calendarId, {
      timeMin,
      timeMax,
    });
    for (const evt of items) await this.applyEvent(target, evt);
    // Reconciliação por ausência: só APÓS paginar tudo com sucesso.
    await this.reconcile(target, items, new Date(timeMin), new Date(timeMax));
    await this.persistToken(target, null, nextSyncToken);
  }

  private async reconcile(
    target: any,
    googleItems: calendar_v3.Schema$Event[],
    timeMin: Date,
    timeMax: Date,
  ): Promise<void> {
    const activeGoogleIds = new Set(
      googleItems
        .filter((e) => e.status !== 'cancelled' && e.id)
        .map((e) => e.id as string),
    );
    const localActive = await this.googleCalendarEventsRepository.findActiveGoogleEventsInRange(
      target.accountId,
      target.id,
      timeMin,
      timeMax,
    );
    for (const local of localActive) {
      if (!activeGoogleIds.has(local.googleEventId)) {
        await this.googleCalendarEventsRepository.markCancelled(local.id);
      }
    }
  }

  private async notifyFrontend(accountId: string): Promise<void> {
    const url = process.env.CHATFUNNEL_API_URL;
    if (!url) return;
    try {
      await axios.post(`${url}/socket`, {
        channel: accountId,
        payload: { type: 'calendar:updated', payload: { accountId } },
      });
    } catch (err: any) {
      console.error('Failed to notify frontend via socket:', err.message);
    }
  }
}
```

- [ ] **Step 2: Criar o spec com helpers + testes de branch/paginação (falha)**

Create `chatfunnel-core/src/services/calendar/handlers/handle-webhook.handler.spec.ts`:

```ts
import { HandleWebhookHandler } from './handle-webhook.handler';

const TOKEN = 'secret';

const makeTarget = (o: Record<string, any> = {}) => ({
  id: 'cal-uuid',
  accountId: 'acc-1',
  calendarId: 'primary',
  watchGoogleId: 'chan-1',
  syncToken: null,
  googleConnection: { id: 'conn-1', tokens: '{}' },
  ...o,
});

function makeDeps(o: {
  target?: any;
  listEventsPage?: jest.Mock;
  findActiveGoogleEventsInRange?: jest.Mock;
  findByGoogleEventIdScoped?: jest.Mock;
  casSyncToken?: jest.Mock;
} = {}) {
  const target = o.target ?? makeTarget();
  const googleCalendarsRepository = {
    findAllWithCalendarId: jest.fn().mockResolvedValue([target]),
    casSyncToken: o.casSyncToken ?? jest.fn().mockResolvedValue(1),
  } as any;
  const googleCalendarEventsRepository = {
    upsertByGoogleEventId: jest.fn().mockResolvedValue({}),
    markCancelled: jest.fn().mockResolvedValue(undefined),
    findByGoogleEventIdScoped:
      o.findByGoogleEventIdScoped ?? jest.fn().mockResolvedValue(null),
    findActiveGoogleEventsInRange:
      o.findActiveGoogleEventsInRange ?? jest.fn().mockResolvedValue([]),
  } as any;
  const googleConnectionsRepository = {} as any;
  const googleCalendarApiService = {
    getAuthenticatedClient: jest.fn().mockResolvedValue({}),
    listEventsPage:
      o.listEventsPage ??
      jest.fn().mockResolvedValue({ items: [], nextPageToken: null, nextSyncToken: 's1' }),
  } as any;
  return {
    target,
    googleCalendarsRepository,
    googleCalendarEventsRepository,
    googleConnectionsRepository,
    googleCalendarApiService,
  };
}

const makeHandler = (deps: ReturnType<typeof makeDeps>) =>
  new HandleWebhookHandler(
    deps.googleCalendarsRepository,
    deps.googleCalendarEventsRepository,
    deps.googleConnectionsRepository,
    deps.googleCalendarApiService,
  );

describe('HandleWebhookHandler', () => {
  beforeEach(() => {
    process.env.GOOGLE_WEBHOOK_CHANNEL_TOKEN = TOKEN;
    delete process.env.CHATFUNNEL_API_URL; // notifyFrontend vira no-op
  });

  describe('guardas', () => {
    it('token inválido → não busca agenda', async () => {
      const deps = makeDeps();
      await makeHandler(deps).execute('chan-1', 'exists', 'wrong');
      expect(deps.googleCalendarsRepository.findAllWithCalendarId).not.toHaveBeenCalled();
    });

    it("resourceState 'sync' → não busca agenda", async () => {
      const deps = makeDeps();
      await makeHandler(deps).execute('chan-1', 'sync', TOKEN);
      expect(deps.googleCalendarsRepository.findAllWithCalendarId).not.toHaveBeenCalled();
    });
  });

  describe('branch cancelled vs ativo (full sync, token null)', () => {
    it('evento ativo → upsert com datas; markCancelled NÃO chamado', async () => {
      const listEventsPage = jest.fn().mockResolvedValue({
        items: [{
          id: 'g1', status: 'confirmed', summary: 'Reunião',
          start: { dateTime: '2026-07-01T10:00:00Z' }, end: { dateTime: '2026-07-01T11:00:00Z' },
        }],
        nextPageToken: null, nextSyncToken: 's1',
      });
      const deps = makeDeps({ listEventsPage });
      await makeHandler(deps).execute('chan-1', 'exists', TOKEN);

      expect(deps.googleCalendarEventsRepository.upsertByGoogleEventId).toHaveBeenCalledWith(
        'g1',
        expect.objectContaining({ googleEventId: 'g1', accountId: 'acc-1', googleCalendarId: 'cal-uuid', isCancelled: false }),
      );
      expect(deps.googleCalendarEventsRepository.markCancelled).not.toHaveBeenCalled();
    });

    it('tombstone cancelado com local existente → markCancelled(local.id); upsert NÃO chamado (sem Invalid Date)', async () => {
      const listEventsPage = jest.fn().mockResolvedValue({
        items: [{ id: 'g1', status: 'cancelled' }],
        nextPageToken: null, nextSyncToken: 's1',
      });
      const findByGoogleEventIdScoped = jest.fn().mockResolvedValue({ id: 'local-1' });
      const deps = makeDeps({ listEventsPage, findByGoogleEventIdScoped });
      await makeHandler(deps).execute('chan-1', 'exists', TOKEN);

      expect(findByGoogleEventIdScoped).toHaveBeenCalledWith('acc-1', 'cal-uuid', 'g1');
      expect(deps.googleCalendarEventsRepository.markCancelled).toHaveBeenCalledWith('local-1');
      expect(deps.googleCalendarEventsRepository.upsertByGoogleEventId).not.toHaveBeenCalled();
    });

    it('tombstone cancelado sem local → markCancelled NÃO chamado (sem throw)', async () => {
      const listEventsPage = jest.fn().mockResolvedValue({
        items: [{ id: 'g1', status: 'cancelled' }],
        nextPageToken: null, nextSyncToken: 's1',
      });
      const deps = makeDeps({ listEventsPage }); // findByGoogleEventIdScoped default → null
      await makeHandler(deps).execute('chan-1', 'exists', TOKEN);

      expect(deps.googleCalendarEventsRepository.markCancelled).not.toHaveBeenCalled();
    });

    it('evento ativo SEM start/end → não faz upsert (evita Invalid Date)', async () => {
      const listEventsPage = jest.fn().mockResolvedValue({
        items: [{ id: 'g1', status: 'confirmed', summary: 'sem datas' }],
        nextPageToken: null, nextSyncToken: 's1',
      });
      const deps = makeDeps({ listEventsPage });
      await makeHandler(deps).execute('chan-1', 'exists', TOKEN);

      expect(deps.googleCalendarEventsRepository.upsertByGoogleEventId).not.toHaveBeenCalled();
    });
  });

  describe('paginação', () => {
    it('duas páginas → aplica os dois eventos e faz CAS com o nextSyncToken final', async () => {
      const listEventsPage = jest.fn()
        .mockResolvedValueOnce({ items: [{ id: 'a', status: 'confirmed', start: { dateTime: '2026-07-01T10:00:00Z' }, end: { dateTime: '2026-07-01T11:00:00Z' } }], nextPageToken: 'p', nextSyncToken: null })
        .mockResolvedValueOnce({ items: [{ id: 'b', status: 'confirmed', start: { dateTime: '2026-07-02T10:00:00Z' }, end: { dateTime: '2026-07-02T11:00:00Z' } }], nextPageToken: null, nextSyncToken: 's2' });
      const deps = makeDeps({ listEventsPage });
      await makeHandler(deps).execute('chan-1', 'exists', TOKEN);

      expect(deps.googleCalendarEventsRepository.upsertByGoogleEventId).toHaveBeenCalledTimes(2);
      expect(deps.googleCalendarsRepository.casSyncToken).toHaveBeenCalledWith('cal-uuid', 'acc-1', null, 's2');
    });
  });
});
```

- [ ] **Step 3: Rodar e ver o estado (deve compilar; os testes de branch devem passar)**

Run: `cd chatfunnel-core && npx jest handle-webhook.handler.spec`
Expected: PASS em todos os `describe` acima (guardas, branch, paginação). Se algo falhar, corrigir o handler até verde antes de seguir.

---

## Task 5: Handler — full sync + reconciliação por ausência

**Files:**
- Modify: `chatfunnel-core/src/services/calendar/handlers/handle-webhook.handler.spec.ts` (adiciona describe)
- (impl já entregue na Task 4 — aqui validamos `reconcile` e `fullSync`)

**Interfaces:**
- Consumes: `findActiveGoogleEventsInRange`, `markCancelled`, `casSyncToken` (expected `null`).

- [ ] **Step 1: Testes de reconciliação (adicionar ao spec)**

In `handle-webhook.handler.spec.ts`, adicionar antes do último `});` de fechamento do `describe('HandleWebhookHandler')`:

```ts
  describe('reconciliação (full sync, token null)', () => {
    it('evento local Google ausente do set do Google → markCancelled', async () => {
      const listEventsPage = jest.fn().mockResolvedValue({
        items: [{ id: 'g1', status: 'confirmed', start: { dateTime: '2026-07-01T10:00:00Z' }, end: { dateTime: '2026-07-01T11:00:00Z' } }],
        nextPageToken: null, nextSyncToken: 's1',
      });
      // local tem g1 (presente) e g2 (ausente do Google → deve cancelar)
      const findActiveGoogleEventsInRange = jest.fn().mockResolvedValue([
        { id: 'local-g1', googleEventId: 'g1' },
        { id: 'local-g2', googleEventId: 'g2' },
      ]);
      const deps = makeDeps({ listEventsPage, findActiveGoogleEventsInRange });
      await makeHandler(deps).execute('chan-1', 'exists', TOKEN);

      expect(deps.googleCalendarEventsRepository.markCancelled).toHaveBeenCalledWith('local-g2');
      expect(deps.googleCalendarEventsRepository.markCancelled).not.toHaveBeenCalledWith('local-g1');
    });

    it('reconciliação escopada por conta+agenda (NATIVE nunca entra na query)', async () => {
      const deps = makeDeps();
      await makeHandler(deps).execute('chan-1', 'exists', TOKEN);
      expect(deps.googleCalendarEventsRepository.findActiveGoogleEventsInRange).toHaveBeenCalledWith(
        'acc-1', 'cal-uuid', expect.any(Date), expect.any(Date),
      );
    });

    it('falha no meio da paginação → reconcile e CAS NÃO acontecem', async () => {
      const listEventsPage = jest.fn()
        .mockResolvedValueOnce({ items: [{ id: 'a', status: 'confirmed', start: { dateTime: '2026-07-01T10:00:00Z' }, end: { dateTime: '2026-07-01T11:00:00Z' } }], nextPageToken: 'p', nextSyncToken: null })
        .mockRejectedValueOnce(new Error('Google 500'));
      const findActiveGoogleEventsInRange = jest.fn().mockResolvedValue([{ id: 'x', googleEventId: 'zzz' }]);
      const deps = makeDeps({ listEventsPage, findActiveGoogleEventsInRange });
      await makeHandler(deps).execute('chan-1', 'exists', TOKEN);

      expect(findActiveGoogleEventsInRange).not.toHaveBeenCalled();
      expect(deps.googleCalendarsRepository.casSyncToken).not.toHaveBeenCalled();
    });

    it('full sync persiste token via CAS com expected=null', async () => {
      const deps = makeDeps(); // listEventsPage default → nextSyncToken 's1'
      await makeHandler(deps).execute('chan-1', 'exists', TOKEN);
      expect(deps.googleCalendarsRepository.casSyncToken).toHaveBeenCalledWith('cal-uuid', 'acc-1', null, 's1');
    });
  });
```

- [ ] **Step 2: Rodar e ver passar**

Run: `cd chatfunnel-core && npx jest handle-webhook.handler.spec -t reconciliação`
Expected: PASS (4 testes).

---

## Task 6: Handler — incremental sync + CAS + 410 condicional + concorrência

**Files:**
- Modify: `chatfunnel-core/src/services/calendar/handlers/handle-webhook.handler.spec.ts` (adiciona describe)

**Interfaces:**
- Consumes: fluxo incremental (`target.syncToken` != null), `casSyncToken` (expected = token lido / clear), `isGone(410)`.

- [ ] **Step 1: Testes incremental / CAS / 410 (adicionar ao spec)**

In `handle-webhook.handler.spec.ts`, adicionar antes do fechamento do `describe('HandleWebhookHandler')`:

```ts
  describe('incremental sync + CAS + 410', () => {
    const gone = () => Object.assign(new Error('Sync token is no longer valid'), { code: 410 });

    it('token presente → usa syncToken (não janela) e avança via CAS com expected=token', async () => {
      const listEventsPage = jest.fn().mockResolvedValue({
        items: [{ id: 'g1', status: 'cancelled' }],
        nextPageToken: null, nextSyncToken: 't2',
      });
      const findByGoogleEventIdScoped = jest.fn().mockResolvedValue({ id: 'local-1' });
      const deps = makeDeps({
        target: makeTarget({ syncToken: 't1' }),
        listEventsPage, findByGoogleEventIdScoped,
      });
      await makeHandler(deps).execute('chan-1', 'exists', TOKEN);

      expect(listEventsPage.mock.calls[0][2]).toEqual(expect.objectContaining({ syncToken: 't1' }));
      expect(listEventsPage.mock.calls[0][2].timeMin).toBeUndefined();
      expect(deps.googleCalendarEventsRepository.markCancelled).toHaveBeenCalledWith('local-1');
      expect(deps.googleCalendarsRepository.casSyncToken).toHaveBeenCalledWith('cal-uuid', 'acc-1', 't1', 't2');
    });

    it('CAS perde (count 0) → sem throw, sem full sync', async () => {
      const listEventsPage = jest.fn().mockResolvedValue({ items: [], nextPageToken: null, nextSyncToken: 't2' });
      const casSyncToken = jest.fn().mockResolvedValue(0);
      const deps = makeDeps({ target: makeTarget({ syncToken: 't1' }), listEventsPage, casSyncToken });
      await makeHandler(deps).execute('chan-1', 'exists', TOKEN);

      expect(casSyncToken).toHaveBeenCalledWith('cal-uuid', 'acc-1', 't1', 't2');
      expect(listEventsPage).toHaveBeenCalledTimes(1); // não fez full sync
    });

    it('410 + clear vence o CAS (count 1) → executa full sync (chamada com janela)', async () => {
      const listEventsPage = jest.fn()
        .mockRejectedValueOnce(gone()) // incremental (syncToken)
        .mockResolvedValueOnce({ items: [], nextPageToken: null, nextSyncToken: 't3' }); // full sync (janela)
      const casSyncToken = jest.fn()
        .mockResolvedValueOnce(1)  // clear condicional (t1 → null)
        .mockResolvedValueOnce(1); // persiste t3 (null → t3)
      const deps = makeDeps({ target: makeTarget({ syncToken: 't1' }), listEventsPage, casSyncToken });
      await makeHandler(deps).execute('chan-1', 'exists', TOKEN);

      expect(casSyncToken).toHaveBeenNthCalledWith(1, 'cal-uuid', 'acc-1', 't1', null);
      expect(listEventsPage).toHaveBeenCalledTimes(2);
      expect(listEventsPage.mock.calls[1][2].timeMin).toBeDefined(); // janela → full sync
    });

    it('410 + clear perde o CAS (count 0) → NÃO executa full sync', async () => {
      const listEventsPage = jest.fn().mockRejectedValueOnce(gone());
      const casSyncToken = jest.fn().mockResolvedValueOnce(0); // outro processo já recuperou
      const deps = makeDeps({ target: makeTarget({ syncToken: 't1' }), listEventsPage, casSyncToken });
      await makeHandler(deps).execute('chan-1', 'exists', TOKEN);

      expect(casSyncToken).toHaveBeenCalledWith('cal-uuid', 'acc-1', 't1', null);
      expect(listEventsPage).toHaveBeenCalledTimes(1); // não tentou janela
    });

    it('token inicial null concorrente → o perdedor do CAS não quebra', async () => {
      const listEventsPage = jest.fn().mockResolvedValue({ items: [], nextPageToken: null, nextSyncToken: 's1' });
      const casSyncToken = jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
      const deps = makeDeps({ listEventsPage, casSyncToken }); // syncToken null (default)
      const handler = makeHandler(deps);

      await handler.execute('chan-1', 'exists', TOKEN);
      await handler.execute('chan-1', 'exists', TOKEN);

      expect(casSyncToken).toHaveBeenNthCalledWith(1, 'cal-uuid', 'acc-1', null, 's1');
      expect(casSyncToken).toHaveBeenNthCalledWith(2, 'cal-uuid', 'acc-1', null, 's1');
      // sem exceção: ambos completaram
    });
  });

  describe('seeding e consistência de token', () => {
    it("handshake 'sync' com syncToken null → semeia via full sync", async () => {
      const deps = makeDeps(); // syncToken null (default)
      await makeHandler(deps).execute('chan-1', 'sync', TOKEN);
      expect(deps.googleCalendarApiService.listEventsPage).toHaveBeenCalled();
      expect(deps.googleCalendarsRepository.casSyncToken).toHaveBeenCalledWith('cal-uuid', 'acc-1', null, 's1');
    });

    it("handshake 'sync' com syncToken existente → ignora (não sincroniza)", async () => {
      const deps = makeDeps({ target: makeTarget({ syncToken: 't1' }) });
      await makeHandler(deps).execute('chan-1', 'sync', TOKEN);
      expect(deps.googleCalendarApiService.listEventsPage).not.toHaveBeenCalled();
    });

    it('última página sem nextSyncToken → NÃO faz CAS (cursor não avança em silêncio)', async () => {
      const listEventsPage = jest.fn().mockResolvedValue({ items: [], nextPageToken: null, nextSyncToken: null });
      const deps = makeDeps({ listEventsPage });
      await makeHandler(deps).execute('chan-1', 'exists', TOKEN);
      expect(deps.googleCalendarsRepository.casSyncToken).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Rodar e ver passar**

Run: `cd chatfunnel-core && npx jest handle-webhook.handler.spec`
Expected: PASS — suíte inteira (guardas, branch, paginação, reconciliação, incremental/CAS/410).

---

## Task 7: Atualizar o vault (gotcha resolvido)

**Files:**
- Modify: `vault/wiki/features/calendar-sync-google.md`

**Interfaces:** documentação — sem código.

- [ ] **Step 1: Atualizar a seção "Mecanismo 1" e a tabela de gotchas**

In `vault/wiki/features/calendar-sync-google.md`:

1. No passo `[e]` (linha ~92-99), substituir o aviso `⚠ A chamada atual não usa showDeleted nem syncToken...` por:

```
   [e] Lista mudanças via sync incremental:
       primeira vez (sem syncToken): listEventsPage(timeMin, timeMax) + reconciliação
         por ausência (cancela locais Google ausentes do retorno, dentro da janela)
       demais: listEventsPage(syncToken) → Google devolve deletados como status:'cancelled'
       cursor (syncToken) avança por CAS na coluna GoogleCalendars.syncToken
       410 GONE → clear condicional do token + novo full sync restrito à agenda
```

2. Na tabela de gotchas (linha ~430), trocar a linha "Webhook não reconcilia exclusões..." por:

```
| Exclusão no Google reflete no banco (implementado, pendente migration/deploy) | Corrigido via syncToken incremental (fix/calendar-google-sync-token): full sync inicial (janela now-24h..+1a) + reconciliação por ausência, depois incremental com status:'cancelled'. Concorrência protegida por CAS no syncToken (não há lock distribuído no projeto). ⚠ Só efetivo após gerar/aplicar a migration da coluna `syncToken` e deploy |
```

3. Atualizar `last_updated:` no frontmatter para `2026-07-29`.

> Nota: manter o status "implementado, pendente migration/deploy" até a migration ser aplicada em produção; só então trocar para "resolvido".

---

## Self-Review

**Spec coverage:**
- Webhook não traz evento → puxa via API: mantido (execute → syncCalendar). ✓
- Exclusão reflete no banco: `applyEvent` branch cancelled → `markCancelled` (Task 4) + reconciliação de fantasmas (Task 5). ✓
- syncToken incremental + paginação: `listEventsPage` (Task 1) + `paginate` (Task 4). ✓
- `showDeleted`/`syncToken` mutuamente corretos por branch: Task 1. ✓
- CAS no cursor + 410 condicional: `casSyncToken` (Task 3) + `syncCalendar` (Task 4/6). ✓
- Sem lock (não existe no projeto) → CAS: Global Constraints + Task 3/6. ✓
- Não tocar NATIVE / `listEvents` legado intacto: Global Constraints + `findActiveGoogleEventsInRange` filtra `googleEventId != null`. ✓
- Schema alterado; migration gerada/aplicada pelo usuário: Task 2. ✓

**Placeholder scan:** nenhum "TBD/TODO"; todo passo tem código real e comando com output esperado. ✓

**Type consistency:** `casSyncToken(id, accountId, expected, next)`, `findByGoogleEventIdScoped(accountId, googleCalendarId, googleEventId)`, `findActiveGoogleEventsInRange(accountId, googleCalendarId, timeMin, timeMax)`, `listEventsPage(auth, calendarId, params)` — nomes e assinaturas idênticos entre Interfaces, impl e testes. ✓

**Ceilings (ponytail) declarados:** reconciliação limitada à janela `now-24h..now+30d` (fantasmas fora da janela não são limpos; upgrade = janela maior ou reconciliação por passes); paginação acumula itens em memória (250/página, aceitável). ✓
