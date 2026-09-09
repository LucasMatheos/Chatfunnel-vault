# Agent V2 Auto-Blacklist Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "human sent a message → pause the assistant for 10 minutes" auto-blacklist behavior fire for **Agent V2** sessions the same way it already fires for the legacy OpenAI Assistant, by teaching the two places that *create* an `iGAutomationsBlacklist` row to also recognize an active `AgentSessions` row, not just an `OpenaiAssistantsThreads` row.

**Architecture:** Extract the "is there an assistant of any generation currently serving this contact+channel?" check into one shared, unit-testable helper — `hasActiveAssistant(contactId, channelId, agentSessionsRepository)` in `chatfunnel-api/src/commands/assistant/hasActiveAssistant.js`. Wire it into the two existing blacklist-creation call sites: `handleCreateBlacklistContact.js` (fires on WhatsApp/Instagram webhook echo — a human replied from the native app) and `SendMessageToContact.js`'s inline `blacklistContact()` (fires when a moderator sends a message from the ChatFunnel livechat). The read-side gate that *honors* the blacklist row (`handleBlacklistedContact.js`, invoked centrally in `processorJob.js` before both the legacy and the Agent V2 dispatch) already blocks both generations correctly once the row exists — it needs no change.

**Tech Stack:** `chatfunnel-api` — Express 4 + **JavaScript CommonJS** (no TypeScript, no build step for any file touched in this plan — none of them live under the `processor/agents-v2/` TS subtree that compiles to `dist/`). Jest + the global deep-Prisma mock from `src/jest.setup.js`. Module aliases (`@database`, `@services`, `@chatfunnel/core/repositories`).

## Global Constraints

Verbatim from the repo rules (`CLAUDE.md` root + `chatfunnel-api/CLAUDE.md`) — non-negotiable:

- Este repo (`chatfunnel-api`) é **JavaScript puro** — NEVER criar arquivos `.ts`. ALWAYS use `require()` (CommonJS) — não `import` (ESM).
- ALWAYS use module aliases (`@database`, `@services`, `@chatfunnel/core/repositories`, etc.) — não paths relativos, **exceto** para requires entre pastas de `commands/` que não têm alias próprio (ex: `../assistant/hasActiveAssistant`) — mesmo padrão já aceito no repo para o require relativo do artefato `dist/processor/agents-v2/createHandlerAgent` em `StopAssistant.js`.
- ALWAYS use `@logger` (Winston) — não `console.log`. (Nenhum dos arquivos deste plano loga nada novo.)
- NEVER conecte diretamente ao banco nem execute qualquer operação contra ele. Os testes usam o mock profundo de Prisma do `jest.setup.js`; nenhuma query real roda.
- NEVER gere ou aplique migrations. Esta alteração não precisa de migration (nenhuma coluna/tabela nova).
- NEVER rode builds automaticamente. Nenhum arquivo deste plano precisa de build (`tsc`/`build:processor`) — são todos `.js` puro fora da árvore `processor/agents-v2/`. Os passos do plano PODEM instruir o engenheiro a rodar `npx jest`; quem executa é o engenheiro, não o Claude.
- Multi-tenancy: `contactId`/`channelId` usados nos dois call sites já vêm validados contra `Account-Selected` pelos handlers que os chamam — este plano não adiciona nenhuma query nova sem esses IDs já resolvidos.

---

## Task 1 — Shared `hasActiveAssistant` helper

**Files:**
- Create: `chatfunnel-api/src/commands/assistant/hasActiveAssistant.js`
- Test (Create): `chatfunnel-api/src/commands/assistant/hasActiveAssistant.test.js`

**Interfaces:**

Consumes:
- `prisma.openaiAssistantsThreads.findFirst({ where })` — global deep-mocked Prisma client from `@database`.
- An injected `agentSessionsRepository` object with method `findByContactAndChannel(contactId: string, channelId: string): Promise<object|null>` — the caller is responsible for constructing the real `AgentSessionsRepository` (from `@chatfunnel/core/repositories`); this module takes it as a parameter instead of instantiating its own, so it stays trivially testable with a plain object double.

Produces:
- `hasActiveAssistant(contactId: string, channelId: string, agentSessionsRepository: { findByContactAndChannel: Function }): Promise<boolean>` — `true` if a legacy Assistant thread OR an Agent V2 session is active for that contact+channel. Tasks 2 and 3 both call this with an `AgentSessionsRepository` instance they construct themselves.

### Steps

- [ ] **Write the failing test file** `chatfunnel-api/src/commands/assistant/hasActiveAssistant.test.js`. Copy verbatim:

```js
const prisma = require("@database");
const hasActiveAssistant = require("./hasActiveAssistant");

const CONTACT_ID = "cnt-0000-0000-0000-000000000001";
const CHANNEL_ID = "chn-0000-0000-0000-000000000001";

function makeAgentSessionsRepository(findByContactAndChannelResult) {
  return {
    findByContactAndChannel: jest
      .fn()
      .mockResolvedValue(findByContactAndChannelResult),
  };
}

describe("hasActiveAssistant", () => {
  it("returns true when a legacy Assistant thread is running", async () => {
    prisma.openaiAssistantsThreads.findFirst.mockResolvedValue({
      id: "thread-1",
    });
    const agentSessionsRepository = makeAgentSessionsRepository(null);

    const result = await hasActiveAssistant(
      CONTACT_ID,
      CHANNEL_ID,
      agentSessionsRepository,
    );

    expect(result).toBe(true);
    expect(
      agentSessionsRepository.findByContactAndChannel,
    ).not.toHaveBeenCalled();
  });

  it("returns true when an Agent V2 session is active (no legacy thread)", async () => {
    prisma.openaiAssistantsThreads.findFirst.mockResolvedValue(null);
    const agentSessionsRepository = makeAgentSessionsRepository({
      id: "sess-1",
      agentId: "agt-1",
    });

    const result = await hasActiveAssistant(
      CONTACT_ID,
      CHANNEL_ID,
      agentSessionsRepository,
    );

    expect(result).toBe(true);
    expect(
      agentSessionsRepository.findByContactAndChannel,
    ).toHaveBeenCalledWith(CONTACT_ID, CHANNEL_ID);
  });

  it("returns false when neither a legacy thread nor an Agent V2 session exists", async () => {
    prisma.openaiAssistantsThreads.findFirst.mockResolvedValue(null);
    const agentSessionsRepository = makeAgentSessionsRepository(null);

    const result = await hasActiveAssistant(
      CONTACT_ID,
      CHANNEL_ID,
      agentSessionsRepository,
    );

    expect(result).toBe(false);
  });

  it("queries the legacy thread by contactId and either the given channelId or null", async () => {
    prisma.openaiAssistantsThreads.findFirst.mockResolvedValue(null);
    const agentSessionsRepository = makeAgentSessionsRepository(null);

    await hasActiveAssistant(CONTACT_ID, CHANNEL_ID, agentSessionsRepository);

    expect(prisma.openaiAssistantsThreads.findFirst).toHaveBeenCalledWith({
      where: {
        contactId: CONTACT_ID,
        OR: [{ channelId: CHANNEL_ID }, { channelId: null }],
      },
    });
  });
});
```

- [ ] **Run the test and watch it FAIL.** From `chatfunnel-api/`: `npx jest src/commands/assistant/hasActiveAssistant.test.js`. **Expected: FAIL** with `Cannot find module './hasActiveAssistant'` — the file does not exist yet.

- [ ] **Write the minimal implementation.** Create `chatfunnel-api/src/commands/assistant/hasActiveAssistant.js`:

```js
const prisma = require("@database");

/**
 * @param {string} contactId
 * @param {string} channelId
 * @param {{ findByContactAndChannel: (contactId: string, channelId: string) => Promise<object|null> }} agentSessionsRepository
 * @returns {Promise<boolean>} true if a legacy Assistant thread or an Agent V2 session is active for this contact+channel
 */
async function hasActiveAssistant(
  contactId,
  channelId,
  agentSessionsRepository,
) {
  const runningThread = await prisma.openaiAssistantsThreads.findFirst({
    where: {
      contactId,
      OR: [{ channelId }, { channelId: null }],
    },
  });
  if (runningThread) return true;

  const agentSession = await agentSessionsRepository.findByContactAndChannel(
    contactId,
    channelId,
  );
  return !!agentSession;
}

module.exports = hasActiveAssistant;
```

- [ ] **Run the test and watch it PASS.** From `chatfunnel-api/`: `npx jest src/commands/assistant/hasActiveAssistant.test.js`. **Expected: PASS** — all 4 tests green.

---

## Task 2 — Use it in the webhook-echo blacklist trigger

**Files:**
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/handleCreateBlacklistContact.js`
- Test (Create): `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/handleCreateBlacklistContact.test.js`

**Context:** This function is called from `_handleEchoWhatsappMessage` (`handleWhatsappMessage.js:34`) and `_handleEchoInstagramMessage` (`handleInstagramMessage.js:119`) whenever the webhook reports an **echo** (a human replied to the contact from the native WhatsApp/Instagram app) and the contact is not already blacklisted. Today it only creates the blacklist row when `prisma.openaiAssistantsThreads.findFirst(...)` finds a running legacy thread — an active Agent V2 session (`AgentSessions` row) is silently ignored, so Agent V2 conversations are never auto-paused on this path.

**Interfaces:**

Consumes:
- `hasActiveAssistant(contactId, channelId, agentSessionsRepository)` from Task 1.
- `require("@chatfunnel/core/repositories")` → `{ AgentSessionsRepository }`. Constructor: `new AgentSessionsRepository(prisma, redisService)` — same pattern already used in `handleActiveAgentSession.js` and `StopAssistant.js`.
- `require("@services")` → `{ redisService }`.

Produces: unchanged public signature — `handleCreateBlacklistContact(context): Promise<object|null>`, where `context.contact.id`, `context.channel.id`, `context.messageId` are read exactly as before.

### Steps

- [ ] **Write the failing test file** `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/handleCreateBlacklistContact.test.js`. Copy verbatim:

```js
const mockHasActiveAssistant = jest.fn();
jest.mock("../../../assistant/hasActiveAssistant", () => mockHasActiveAssistant);

jest.mock("@services", () => ({ redisService: {} }));

const mockFindByContactAndChannel = jest.fn();
jest.mock("@chatfunnel/core/repositories", () => ({
  AgentSessionsRepository: jest.fn().mockImplementation(() => ({
    findByContactAndChannel: mockFindByContactAndChannel,
  })),
}));

const prisma = require("@database");
const handleCreateBlacklistContact = require("./handleCreateBlacklistContact");

const CONTACT_ID = "cnt-0000-0000-0000-000000000001";
const CHANNEL_ID = "chn-0000-0000-0000-000000000001";
const MESSAGE_ID = "msg-0000-0000-0000-000000000001";

function makeContext() {
  return {
    contact: { id: CONTACT_ID },
    channel: { id: CHANNEL_ID },
    messageId: MESSAGE_ID,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("handleCreateBlacklistContact", () => {
  it("creates a blacklist row when an assistant is active (legacy or Agent V2)", async () => {
    mockHasActiveAssistant.mockResolvedValue(true);
    prisma.iGAutomationsBlacklist.create.mockResolvedValue({ id: "bl-1" });

    const result = await handleCreateBlacklistContact(makeContext());

    expect(mockHasActiveAssistant).toHaveBeenCalledWith(
      CONTACT_ID,
      CHANNEL_ID,
      expect.anything(),
    );
    expect(prisma.iGAutomationsBlacklist.create).toHaveBeenCalledWith({
      data: {
        contactId: CONTACT_ID,
        channelId: CHANNEL_ID,
        fromMessageId: MESSAGE_ID,
      },
    });
    expect(result).toEqual({ id: "bl-1" });
  });

  it("does nothing when no assistant is active", async () => {
    mockHasActiveAssistant.mockResolvedValue(false);

    const result = await handleCreateBlacklistContact(makeContext());

    expect(prisma.iGAutomationsBlacklist.create).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
```

- [ ] **Run the test and watch it FAIL.** From `chatfunnel-api/`: `npx jest src/commands/instagram/WebHookHandler/processor/handleCreateBlacklistContact.test.js`. **Expected: FAIL** — the current implementation calls `prisma.openaiAssistantsThreads.findFirst` directly instead of the mocked `hasActiveAssistant`, so `mockHasActiveAssistant` is never called and the first assertion fails; `prisma.iGAutomationsBlacklist.create` is also never called because the deep-mocked `openaiAssistantsThreads.findFirst` defaults to resolving `undefined`.

- [ ] **Replace the implementation.** Overwrite `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/handleCreateBlacklistContact.js` with:

```js
const prisma = require("@database");
const { redisService } = require("@services");
const { AgentSessionsRepository } = require("@chatfunnel/core/repositories");
const hasActiveAssistant = require("../../../assistant/hasActiveAssistant");

const agentSessionsRepository = new AgentSessionsRepository(
  prisma,
  redisService,
);

/**
 * @param {object} context
 * @returns {Promise<object|null>}
 * @description coloca o contato na blacklist (pausa automações) se houver um
 * legacy Assistant ou uma sessão Agent V2 ativa para o contato+canal
 */
async function handleCreateBlacklistContact(context) {
  const isActive = await hasActiveAssistant(
    context.contact.id,
    context.channel.id,
    agentSessionsRepository,
  );
  if (!isActive) return null;

  // coloca o contato na blacklist
  return prisma.iGAutomationsBlacklist.create({
    data: {
      contactId: context.contact.id,
      channelId: context.channel.id,
      fromMessageId: context.messageId,
    },
  });
}

module.exports = handleCreateBlacklistContact;
```

- [ ] **Run the test and watch it PASS.** From `chatfunnel-api/`: `npx jest src/commands/instagram/WebHookHandler/processor/handleCreateBlacklistContact.test.js`. **Expected: PASS** — both tests green.

- [ ] **Run the wider processor test suite to check for regressions.** From `chatfunnel-api/`: `npx jest src/commands/instagram/WebHookHandler/processor`. **Expected: PASS** — `handleCreateBlacklistContact` has no other direct callers besides `handleWhatsappMessage.js` and `handleInstagramMessage.js`, which pass through `context` unchanged.

---

## Task 3 — Use it in the livechat send-message blacklist trigger

**Files:**
- Modify: `chatfunnel-api/src/commands/contacts/SendMessageToContact.js`

**Context:** `SendMessageToContact.js` is the handler behind `POST /api/chat/:contactId/:channelId/messages` (`ContactsRoutes.js:167-171`) — this is what fires when a moderator sends a message from the ChatFunnel livechat UI. Its inline `blacklistContact()` function (currently at lines 645-685) has the exact same gap as Task 2: it only checks `prisma.openaiAssistantsThreads.findFirst(...)` before creating the blacklist row, so a moderator messaging a contact served by Agent V2 never pauses it. There is currently no test file for this handler (`SendMessageToContact.test.js` does not exist) — building a full request/response test harness for this ~700-line handler (it also touches `WahaApi`, `CloudApi`, `FacebookAPI`, kanban, sockets, etc.) is out of scope for this fix. This task is verified manually instead, same honesty-over-invented-coverage rule used for the `AgentSessionWorker` guard in `docs/superpowers/plans/2026-07-24-stop-assistant-agent-v2.md`.

**Interfaces:**

Consumes:
- `hasActiveAssistant(contactId, channelId, agentSessionsRepository)` from Task 1.
- `require("@chatfunnel/core/repositories")` → add `AgentSessionsRepository` to the existing `MessagesRepository` destructure.
- `require("@services")` → `{ redisService }` (new import in this file).

Produces: no signature change to the exported handler. Behavioral change only: `blacklistContact()` now also creates the `iGAutomationsBlacklist` row when an Agent V2 session is active, even with no legacy thread.

### Steps

- [ ] **Update the top-of-file requires.** In `chatfunnel-api/src/commands/contacts/SendMessageToContact.js`, replace lines 1-6:

```js
const prisma = require("@database");
const errors = require("@errors");
const { CloudApi } = require("@chatfunnel/core/meta");
const { WahaApi } = require("@wahaAPI");
const { MessagesRepository } = require("@chatfunnel/core/repositories");
const FacebookAPI = require("@facebookAPI");
```

with:

```js
const prisma = require("@database");
const errors = require("@errors");
const { CloudApi } = require("@chatfunnel/core/meta");
const { WahaApi } = require("@wahaAPI");
const {
  MessagesRepository,
  AgentSessionsRepository,
} = require("@chatfunnel/core/repositories");
const { redisService } = require("@services");
const FacebookAPI = require("@facebookAPI");
const hasActiveAssistant = require("../assistant/hasActiveAssistant");
```

Leave the remaining requires (`@chatfunnel/core/database` destructure, `crypto`, `jsonpath-plus`) exactly as they are — they sit immediately below this block.

- [ ] **Instantiate the repository once, module-scope.** Immediately after the `moderatorIdentifierText`/`buildModeratorPrefixedMessage`/`getJSONPath` function declarations (i.e. right before `module.exports = async function (req, res) {` at line 494), add:

```js
const agentSessionsRepository = new AgentSessionsRepository(
  prisma,
  redisService,
);

```

- [ ] **Replace the `blacklistContact` body.** Replace the current block (lines ~645-685):

```js
  // caso exista um assistente em progresso, para a execução
  const blacklistContact = async () => {
    if (isObservation) return;
    const blacklistedContact = await prisma.iGAutomationsBlacklist.findFirst({
      where: {
        contactId: contact.id,
        OR: [{ channelId: channel.id }, { channelId: null }],
      },
      orderBy: { createdAt: "desc" },
    });
    if (blacklistedContact) {
      await prisma.iGAutomationsBlacklist.update({
        where: {
          id: blacklistedContact.id,
        },
        data: {
          updatedAt: new Date(),
        },
      });
      return;
    }

    const runningThread = await prisma.openaiAssistantsThreads.findFirst({
      where: {
        contactId: contact.id,
        ...(blacklistedContact
          ? { channelId: blacklistedContact.channelId }
          : { OR: [{ channelId: channel.id }, { channelId: null }] }),
      },
      orderBy: { channelId: { nulls: "last", sort: "asc" } },
    });
    if (!runningThread) return;

    await prisma.iGAutomationsBlacklist.create({
      data: {
        contactId: contact.id,
        channelId: channel.id,
      },
    });
  };
  await blacklistContact();
```

with:

```js
  // caso exista um assistente (legacy ou Agent V2) em progresso, pausa as automações
  const blacklistContact = async () => {
    if (isObservation) return;
    const blacklistedContact = await prisma.iGAutomationsBlacklist.findFirst({
      where: {
        contactId: contact.id,
        OR: [{ channelId: channel.id }, { channelId: null }],
      },
      orderBy: { createdAt: "desc" },
    });
    if (blacklistedContact) {
      await prisma.iGAutomationsBlacklist.update({
        where: {
          id: blacklistedContact.id,
        },
        data: {
          updatedAt: new Date(),
        },
      });
      return;
    }

    const isActive = await hasActiveAssistant(
      contact.id,
      channel.id,
      agentSessionsRepository,
    );
    if (!isActive) return;

    await prisma.iGAutomationsBlacklist.create({
      data: {
        contactId: contact.id,
        channelId: channel.id,
      },
    });
  };
  await blacklistContact();
```

Note: the old `runningThread` query's `...(blacklistedContact ? ... : ...)` ternary was always taking the `else` branch in practice — the function already returns early right above it ("if (blacklistedContact) { ...; return; }"), so `blacklistedContact` is always falsy by the time that query ran. Delegating to `hasActiveAssistant` (which always queries with the plain `OR: [{ channelId }, { channelId: null }]` shape) preserves the exact same behavior for the legacy check while adding the Agent V2 check.

- [ ] **Run the existing test suite for this directory to confirm nothing else broke.** From `chatfunnel-api/`: `npx jest src/commands/contacts`. **Expected:** Jest reports "No tests found" for this path — there are no test files in `src/commands/contacts/` yet, so this simply confirms nothing was left in a broken, half-edited state (a syntax error would make Jest fail to even collect the suite).

- [ ] **Manual verification — Agent V2 conversation, moderator sends a message:**
  1. Start a conversation served by Agent V2 for a given `contactId`/`channelId` (an `AgentSessions` row exists; no `OpenaiAssistantsThreads` row for that pair).
  2. As a moderator, send a message via the livechat UI (`POST /api/chat/:contactId/:channelId/messages`, `isObservation` not set to `true`).
  3. Confirm a new row now exists in `iGAutomationsBlacklist` for that `contactId`/`channelId`.
  4. Send an inbound message from the contact within 10 minutes and confirm the pipeline exits at `handleBlacklistedContact` in `processorJob.js` (log line `handleBlacklistedContact`) instead of reaching `handleActiveAgentSession` — i.e. the contact receives no Agent V2 reply.
  5. Wait past the pause window (or have the engineer adjust `updatedAt` in the row) and confirm a new inbound message resumes normal Agent V2 handling.

- [ ] **Manual verification — legacy conversation still behaves exactly as before:**
  1. Repeat the same steps against a contact/channel served by the legacy Assistant (`OpenaiAssistantsThreads` row, no `AgentSessions` row).
  2. Confirm the blacklist row is still created and the 10-minute pause still applies — this is the pre-existing behavior; it must be unaffected by this change.

---

## Manual validation (full)

```text
1. Contato servido por Agent V2, sem thread legacy.
2. Moderador manda mensagem pelo livechat.
3. Confirma linha criada em iGAutomationsBlacklist (contactId/channelId corretos).
4. Contato manda mensagem em seguida (<10min) — confirma que NAO chega resposta do Agent V2.
5. Repete os passos 1-4 simulando o echo do WhatsApp Business App (humano responde direto no app, nao pelo livechat) — mesmo resultado esperado via handleCreateBlacklistContact.
6. Repete os passos 1-4 para um contato servido pelo legacy Assistant — confirma que o comportamento pre-existente continua igual.
7. Passados os 10 minutos (ou pausedTime customizado via "Pausar automações"), confirma que uma nova mensagem do contato volta a acionar o Agent V2 normalmente.
```

## Observations

- Não rodar operações diretas no banco durante implementação ou validação.
- Não gerar ou aplicar migrations — não há alteração de schema neste plano.
- Não rodar builds automaticamente — nenhum arquivo deste plano precisa de `tsc`/`build:processor`; o engenheiro roda apenas `npx jest` conforme os passos.
