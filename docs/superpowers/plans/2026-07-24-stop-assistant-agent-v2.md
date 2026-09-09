# Stop Assistant — Agent V2 Termination Implementation Plan

For agentic workers: execute this plan with the `superpowers:subagent-driven-development` workflow — one task per subagent, TDD (RED → GREEN → commit) inside each task, review checkpoints between tasks.

**Goal:** Make the `StopAssistant` command (`POST /accounts/stop_assistant/:contactId/:channelId/:type`) terminate whichever AI generation is active for a contact+channel: the **Agent V2** session (row in `AgentSessions`) if one exists, otherwise the **legacy Assistant** (thread in `OpenaiAssistantsThreads`). The endpoint stays idempotent (200 `{}` when nothing is active) and the shared `servedByAssistant` flag is reset on both paths. A cooperative guard in `AgentSessionWorker` discards an in-flight LLM response when the session is terminated mid-processing, so the contact never receives a reply after "Encerrar".

**Architecture:** `StopAssistant.js` (JS command in `chatfunnel-api`) validates account/user/channel/contact, clears broadcast + blacklist control, applies `blockedAgent` when `type=block_assistant`, writes one `SYSTEM` message, resets `servedByAssistant` via `HandlerAssistant.finishServedByAssistant()`, then branches: V2 → `createHandlerAgent → loadAgent → setSession → terminateSession({interrupted, endReason:"INTERRUPTED"})`; legacy → `findAndSetRunningThread → expireAssistant({onDelete:false, interrupted:true})`. `terminateSession()` deletes the `AgentSessions` row, and that deletion is the signal the worker's cooperative guard reads.

**Tech Stack:** `chatfunnel-api` — Express 4 + **JavaScript CommonJS** (no TypeScript in this repo except the pre-existing `.ts` files under `processor/agents-v2/` which compile to `dist/`). Jest + `jest-mock-extended` + `supertest`. Module aliases (`@database`, `@queues`, `@services`, `@handlerAssistant`, `@chatfunnel/core/repositories`). The compiled Agent V2 handler is required from `dist/` via a relative path (build artifact, not aliased).

## Global Constraints

Verbatim from the repo rules (`CLAUDE.md` root + `chatfunnel-api/CLAUDE.md`) — non-negotiable:

- Este repo (`chatfunnel-api`) e **JavaScript puro** — NEVER criar arquivos `.ts`. ALWAYS use `require()` (CommonJS) — nao `import` (ESM).
- ALWAYS use module aliases (`@database`, `@queues`, `@services`, `@handlerAssistant`, etc.) — nao paths relativos. **Exceção única:** o require do artefato compilado `dist/processor/agents-v2/createHandlerAgent` é relativo por não ser aliasado (mesmo padrão de `handleActiveAgentSession.js`).
- ALWAYS use `@logger` (Winston) — nao `console.log`.
- NEVER conecte diretamente ao banco nem execute qualquer operação contra ele (leitura, escrita, DDL, SQL raw, seeds, migrations). Os testes usam o mock profundo de Prisma do `jest.setup.js`; nenhuma query real roda.
- NEVER gere ou aplique migrations. Esta alteração não precisa de migration.
- NEVER rode builds automaticamente. Os passos do plano PODEM instruir o engenheiro a rodar `npm test`/build; quem executa é o engenheiro, não o Claude.
- Multi-tenancy já é validada no comando (account/channel/contact conferidos contra `Account-Selected` antes de qualquer busca de sessão).
- Git: NEVER commit automaticamente sem pedido; NEVER incluir `Co-Authored-By`; NEVER commit em `main`/`release`; ALWAYS criar branch `feature/...`.

---

## Task 1 — Terminate Agent V2 (or legacy) in StopAssistant

**Files:**
- Modify: `chatfunnel-api/src/commands/assistant/StopAssistant.js`
- Test (Create): `chatfunnel-api/src/commands/assistant/StopAssistant.test.js`

**Interfaces:**

Consumes:
- `require("@chatfunnel/core/repositories")` → `{ AgentSessionsRepository }`. Constructor: `new AgentSessionsRepository(prisma, redisService)`. Method used: `findByContactAndChannel(contactId: string, channelId: string): Promise<AgentSessions | null>` (raw-SQL lookup, confirmed at `chatfunnel-core/src/repositories/agent_sessions.repository.ts:40`).
- `require("@services")` → `{ redisService }`.
- `require("../../../dist/processor/agents-v2/createHandlerAgent")` → `{ createHandlerAgent(agentId: string, context): Promise<HandlerAgent> }`. Path confirmed: `handleActiveAgentSession.js` (at `src/commands/instagram/WebHookHandler/processor/`) requires `../../../../../dist/...` (5 hops to repo root); from `src/commands/assistant/` it is 3 hops → `../../../dist/processor/agents-v2/createHandlerAgent`.
- `HandlerAgent` methods (all required, none optional): `loadAgent(agentId)`, `setSession(session)`, `terminateSession({ interrupted, endReason })`. `loadAgent`+`setSession` are mandatory because `persistOutcome` (`HandlerAgent.ts:1521`) and `handleLifecycleAutomations("endSession")` (`HandlerAgent.ts:1394`) early-return on `if (!this.agent || !this.session)` — skipping them silently drops the `INTERRUPTED` outcome (analytics hole) and the `endSession` automation.
- `require("@handlerAssistant")` → `HandlerAssistant` class. Methods used: `finishServedByAssistant()` (idempotent `updateMany` + emits `updated-chat`, `HandlerAssistant.js:2819`), `findAndSetRunningThread()`, `expireAssistant({ onDelete, interrupted })` (self-guards `if (!this.runningThread) return`, `HandlerAssistant.js:2837`).

Produces:
- HTTP `200 {}` on success/idempotent; `404 { errors: [...] }` on missing account/user/account-record/channel/contact.
- Side effects: deletes `AgentSessions` row (V2) or expires the legacy thread; resets `contactsChannels.servedByAssistant`; emits `signalR` `updated-chat`.

### Steps

- [ ] **Write the failing test file** `chatfunnel-api/src/commands/assistant/StopAssistant.test.js` with the full code below. It mocks `@handlerAssistant`, `@queues`, `@services`, `@chatfunnel/core/repositories`, and the compiled `createHandlerAgent` (as a `virtual` mock so the test needs no build). `@database` is the global deep prisma mock from `jest.setup.js`. Copy verbatim:

```js
// Mock the compiled Agent V2 handler (dist artifact — not built during unit tests).
// virtual:true lets jest.mock resolve a module that may not exist on disk yet.
const mockLoadAgent = jest.fn();
const mockSetSession = jest.fn();
const mockTerminateSession = jest.fn();
const mockCreateHandlerAgent = jest.fn(async () => ({
  loadAgent: mockLoadAgent,
  setSession: mockSetSession,
  terminateSession: mockTerminateSession,
}));
jest.mock(
  "../../../dist/processor/agents-v2/createHandlerAgent",
  () => ({ createHandlerAgent: mockCreateHandlerAgent }),
  { virtual: true },
);

// HandlerAssistant — shared instance methods so assertions survive re-instantiation.
const mockFinishServedByAssistant = jest.fn();
const mockFindAndSetRunningThread = jest.fn();
const mockExpireAssistant = jest.fn();
jest.mock("@handlerAssistant", () =>
  jest.fn().mockImplementation(() => ({
    finishServedByAssistant: mockFinishServedByAssistant,
    findAndSetRunningThread: mockFindAndSetRunningThread,
    expireAssistant: mockExpireAssistant,
  })),
);

// AgentSessionsRepository — findByContactAndChannel drives the V2/legacy branch.
const mockFindByContactAndChannel = jest.fn();
jest.mock("@chatfunnel/core/repositories", () => ({
  AgentSessionsRepository: jest.fn().mockImplementation(() => ({
    findByContactAndChannel: mockFindByContactAndChannel,
  })),
}));

jest.mock("@services", () => ({ redisService: {} }));

const mockCancelJob = jest.fn();
jest.mock("@queues", () => ({
  removeAutomationBlacklistQueue: { cancelJob: mockCancelJob },
}));

const prisma = require("@database");
const stopAssistant = require("./StopAssistant");

global.signalR = { emit: jest.fn() };

const ACCOUNT_ID = "acc-0000-0000-0000-000000000001";
const USER_ID = "usr-0000-0000-0000-000000000001";
const CHANNEL_ID = "chn-0000-0000-0000-000000000001";
const CONTACT_ID = "cnt-0000-0000-0000-000000000001";
const AGENT_ID = "agt-0000-0000-0000-000000000001";

function makeReq(overrides = {}) {
  const headers = {
    "Account-Selected": ACCOUNT_ID,
    ...(overrides.headers || {}),
  };
  return {
    header: jest.fn((key) => headers[key]),
    params: {
      contactId: CONTACT_ID,
      channelId: CHANNEL_ID,
      type: "stop_assistant",
      ...(overrides.params || {}),
    },
    userId: overrides.userId !== undefined ? overrides.userId : USER_ID,
  };
}

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// Wire the happy-path validation lookups on the deep prisma mock.
function primeValidation() {
  prisma.users.findUnique.mockResolvedValue({ id: USER_ID, name: "Moderator" });
  prisma.accounts.findFirst.mockResolvedValue({ id: ACCOUNT_ID });
  prisma.channels.findFirst.mockResolvedValue({
    id: CHANNEL_ID,
    accountId: ACCOUNT_ID,
    allocatedType: "WHATSAPP",
  });
  prisma.contacts.findFirst.mockResolvedValue({
    id: CONTACT_ID,
    accountId: ACCOUNT_ID,
  });
  prisma.broadcastMessageSentAssistants.deleteMany.mockResolvedValue({ count: 0 });
  prisma.iGAutomationsBlacklist.findFirst.mockResolvedValue(null);
  prisma.contactsChannels.updateMany.mockResolvedValue({ count: 1 });
  prisma.messages.create.mockResolvedValue({ id: "msg-1" });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("StopAssistant", () => {
  it("returns 404 when Account-Selected header is missing", async () => {
    const req = makeReq({ headers: { "Account-Selected": undefined } });
    const res = makeRes();

    await stopAssistant(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(prisma.users.findUnique).not.toHaveBeenCalled();
  });

  it("terminates the Agent V2 session when one exists (no legacy expire)", async () => {
    primeValidation();
    mockFindByContactAndChannel.mockResolvedValue({
      id: "sess-1",
      agentId: AGENT_ID,
    });
    const req = makeReq();
    const res = makeRes();

    await stopAssistant(req, res);

    expect(mockFinishServedByAssistant).toHaveBeenCalledTimes(1);
    expect(mockCreateHandlerAgent).toHaveBeenCalledWith(
      AGENT_ID,
      expect.objectContaining({ contact: expect.any(Object) }),
    );
    expect(mockLoadAgent).toHaveBeenCalledWith(AGENT_ID);
    expect(mockSetSession).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: AGENT_ID }),
    );
    expect(mockTerminateSession).toHaveBeenCalledWith({
      interrupted: true,
      endReason: "INTERRUPTED",
    });
    expect(mockExpireAssistant).not.toHaveBeenCalled();
    expect(mockFindAndSetRunningThread).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({});
  });

  it("expires the legacy assistant when no Agent V2 session exists", async () => {
    primeValidation();
    mockFindByContactAndChannel.mockResolvedValue(null);
    const req = makeReq();
    const res = makeRes();

    await stopAssistant(req, res);

    expect(mockFinishServedByAssistant).toHaveBeenCalledTimes(1);
    expect(mockFindAndSetRunningThread).toHaveBeenCalledTimes(1);
    expect(mockExpireAssistant).toHaveBeenCalledWith({
      onDelete: false,
      interrupted: true,
    });
    expect(mockCreateHandlerAgent).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({});
  });

  it("stays idempotent (200 + updated-chat) when nothing is active", async () => {
    primeValidation();
    mockFindByContactAndChannel.mockResolvedValue(null);
    // expireAssistant is a no-op because there is no running thread.
    mockExpireAssistant.mockResolvedValue(undefined);
    const req = makeReq();
    const res = makeRes();

    await stopAssistant(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({});
    expect(global.signalR.emit).toHaveBeenCalledWith(
      "broadcast",
      expect.objectContaining({
        to: ACCOUNT_ID,
        payload: expect.objectContaining({
          type: "updated-chat",
          payload: { contactId: CONTACT_ID, channelId: CHANNEL_ID },
        }),
      }),
    );
  });

  it("applies blockedAgent and writes END_BLOCK on type=block_assistant", async () => {
    primeValidation();
    mockFindByContactAndChannel.mockResolvedValue(null);
    const req = makeReq({ params: { type: "block_assistant" } });
    const res = makeRes();

    await stopAssistant(req, res);

    expect(prisma.contactsChannels.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contactId: CONTACT_ID, channelId: CHANNEL_ID },
        data: expect.objectContaining({
          blockedAgent: true,
          blockedAgentBy: "HUMAN",
          blockedAgentById: USER_ID,
        }),
      }),
    );
    expect(prisma.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          objMessage: expect.objectContaining({ action: "END_BLOCK" }),
        }),
      }),
    );
  });

  it("resets servedByAssistant on BOTH the V2 and legacy paths", async () => {
    // V2 path
    primeValidation();
    mockFindByContactAndChannel.mockResolvedValue({ id: "sess-1", agentId: AGENT_ID });
    await stopAssistant(makeReq(), makeRes());
    expect(mockFinishServedByAssistant).toHaveBeenCalledTimes(1);

    // legacy path
    jest.clearAllMocks();
    primeValidation();
    mockFindByContactAndChannel.mockResolvedValue(null);
    await stopAssistant(makeReq(), makeRes());
    expect(mockFinishServedByAssistant).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Run the tests and watch them FAIL.** From `chatfunnel-api/`: `npx jest src/commands/assistant/StopAssistant.test.js`. `npx jest` bypasses the `pretest` build (the dist require is `virtual`-mocked), so no build is needed. **Expected: FAIL** — the current `StopAssistant.js` never calls `finishServedByAssistant` and never queries `AgentSessionsRepository`, so "terminates the Agent V2 session…", "resets servedByAssistant on BOTH…", and the `finishServedByAssistant` expectation in "expires the legacy assistant…" fail. The 404, block_assistant, and idempotency assertions may already pass against legacy code — that is fine.

- [ ] **Implement the two new requires at the top of `StopAssistant.js`.** Add after the existing requires (keep the existing five):

```js
const { AgentSessionsRepository } = require("@chatfunnel/core/repositories");
const { redisService } = require("@services");
```

- [ ] **Replace the legacy termination block with the shared-reset + branch.** In `StopAssistant.js`, replace the current block (lines ~118-123):

```js
  const handlerAssistant = new HandlerAssistant(context);
  await handlerAssistant.findAndSetRunningThread();
  await handlerAssistant.expireAssistant({
    onDelete: false,
    interrupted: true,
  });
```

with:

```js
  // Reset servedByAssistant on BOTH generations. The legacy expireAssistant()
  // used to do this unconditionally; the V2 terminateSession() does NOT touch
  // this flag, so call it here (idempotent updateMany + emits updated-chat)
  // before branching so both paths inherit the reset.
  const handlerAssistant = new HandlerAssistant(context);
  await handlerAssistant.finishServedByAssistant();

  // The message pipeline prioritizes an active Agent V2 session, so look it up
  // first. Never delete AgentSessions directly — terminateSession() also clears
  // queues, cache and session state.
  const agentSessionsRepository = new AgentSessionsRepository(
    prisma,
    redisService,
  );
  const agentSession = await agentSessionsRepository.findByContactAndChannel(
    contact.id,
    channel.id,
  );

  if (agentSession) {
    // dist artifact require (not aliased) — same pattern as handleActiveAgentSession.js
    const {
      createHandlerAgent,
    } = require("../../../dist/processor/agents-v2/createHandlerAgent");

    const handlerAgent = await createHandlerAgent(agentSession.agentId, context);
    // loadAgent + setSession are REQUIRED: persistOutcome and the endSession
    // lifecycle automation early-return without this.agent / this.session.
    await handlerAgent.loadAgent(agentSession.agentId);
    handlerAgent.setSession(agentSession);
    await handlerAgent.terminateSession({
      interrupted: true,
      endReason: "INTERRUPTED",
    });
  } else {
    // Legacy fallback — call unconditionally; expireAssistant self-guards on
    // an absent running thread (if (!this.runningThread) return), preserving
    // idempotency.
    await handlerAssistant.findAndSetRunningThread();
    await handlerAssistant.expireAssistant({
      onDelete: false,
      interrupted: true,
    });
  }
```

Leave the `global.signalR.emit("broadcast", ...)` block and `return res.status(200).json({})` exactly as they are.

- [ ] **Run the tests and watch them PASS.** From `chatfunnel-api/`: `npx jest src/commands/assistant/StopAssistant.test.js`. **Expected: PASS** — all 6 tests green.

---

## Task 2 — Cooperative guard in AgentSessionWorker

**Files:**
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/queue/AgentSessionWorker.ts`

**Interfaces:**

Consumes (already in module scope — no new imports):
- `sessionsRepo.findById(sessionId): Promise<AgentSession | null>` (same repo/method used at `AgentSessionWorker.ts:71`).
- `logger.agent(level, message)` (Winston agent logger, used throughout the file).

Produces:
- No signature change. Behavioral change only: when the `AgentSessions` row was deleted during `callLLM()` (e.g. by `StopAssistant.terminateSession()` from Task 1), the in-flight response is dropped — it is neither persisted (`persistSessionMessage("ASSISTANT", ...)`) nor sent (`sendResponseToContact(...)`) — and the processing loop `break`s.

**Why this exact point, and only this point** (verified against the file):
- The lock (`AgentSessionLock`, `SET NX EX`, key `agent:lock:<sessionId>`, TTL 120s) is held for the whole job, not just `callLLM()`. Acquiring it from StopAssistant is impossible (`NX`), so cooperation must be a read-check, not a lock.
- `terminateSession()` deletes the row (invalidating cache) but does not touch the lock — the deleted row is the signal.
- The block at `AgentSessionWorker.ts:251-259` (`if (response.content) persistSessionMessage("ASSISTANT")` then `sendResponseToContact`) is the **only** user-facing point: `executeToolLoop` and the `objectiveCompleted` branch do not call `sendResponseToContact`. A single guard here covers every contact-facing path — no guard needed in the `objectiveCompleted` branch.
- Cost is one Redis/DB read per iteration — negligible on an I/O-bound LLM worker. Residual ~1ms window between `findById` and `send` is accepted; closing it would require an atomic token on `send` (over-engineering to cut 90s→1ms).

### Steps

- [ ] **Insert the guard** in `AgentSessionWorker.ts`, immediately before the `if (response.content)` block (currently line 251), after `executeToolLoop` (line 249):

```ts
      // StopAssistant (or expiration) may have terminated the session during
      // callLLM. If the row is gone, discard the in-flight response — do not
      // persist and do not send. Same "session not found → skip" semantics as
      // the load guard above (lines 71-78).
      if (!(await sessionsRepo.findById(sessionId))) {
        logger.agent(
          "info",
          `session terminated during processing, discarding — sessionId=${sessionId}`,
        );
        break;
      }
```

- [ ] **No automated test for this guard — verify manually.** `processSessionJob` is a private (non-exported) function, and importing `AgentSessionWorker.ts` instantiates a live BullMQ `Worker` at module load (`AgentSessionWorker.ts:309`) plus the real Redis lock/buffer/debounce and provider handler classes. A unit test would require fabricating fragile mocks for bullmq, redis and every provider — mocks that would not correspond to the real code paths. Per the plan's honesty-over-coverage rule, this is verified manually instead of with an invented unit test.

- [ ] **Build the processor** so the guard is compiled into `dist/`. From `chatfunnel-api/`, the engineer (not Claude) runs `npm run build:processor`. The Agent V2 code path and the worker run from `dist/`, so the guard only takes effect after a build.

- [ ] **Manual reproduction — the exact race:**
  1. Start a conversation served by an Agent V2 (contact+channel has an active `AgentSessions` row and a running `AgentSessionWorker` job inside `callLLM()`).
  2. Send fast messages to build a buffer/debounce and keep the worker busy.
  3. While the worker is inside `callLLM()` (holding the lock), call `POST /accounts/stop_assistant/:contactId/:channelId/stop_assistant` — this runs Task 1's `terminateSession()`, which deletes the `AgentSessions` row.
  4. When the LLM returns, confirm the worker logs `session terminated during processing, discarding — sessionId=<id>` and `break`s.
  5. **Confirm the contact receives NO further message** after "Encerrar", and no `persistSessionMessage("ASSISTANT")` write happens against the deleted session (no FK/missing-row error).
  6. Confirm the `INTERRUPTED` outcome was persisted and the livechat updated via socket (`updated-chat`).

---

## Consistency note (out of scope, documented)

By business rule a legacy Assistant and an Agent V2 should not both be active for the same contact+channel, but `OpenaiAssistantsThreads` and `AgentSessions` are separate tables with no shared constraint. The pipeline prioritizes V2; the implementation could optionally log a warning if both are found and terminate both. Not implemented here — flagged for a follow-up if the inconsistent state is ever observed.

## Manual validation (full)

```text
1. Start a legacy-Assistant conversation.
2. Trigger "Parar assistente".
3. Confirm interruption and removal of the active thread.

4. Start an Agent V2 conversation.
5. Send fast messages to build buffer/debounce.
6. Trigger "Parar assistente".
7. Confirm no later response is sent.
8. Confirm the AgentSession row was removed.
9. Confirm the INTERRUPTED outcome was created.
10. Confirm the livechat updated via socket.
```

## Observations

- Do not run direct DB operations during implementation or validation.
- Do not generate or apply migrations for this change.
- Do not run builds automatically — the engineer runs `npm run build:processor` (Task 2) and `npx jest` (Task 1) manually.
