# Agent V2 Stop & Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Supersedes `2026-07-28-agent-v2-block-guard.md` (that plan guarded only `execute()`/`resumeLoop()` and keyed the worker off `blockedAgent`, which misses the plain "Encerrar" and the running worker). This plan splits the two signals correctly.

**Goal:** Make Agent V2 honor both stop commands — "Encerrar agente" (stop the current session only) and "Encerrar e bloquear IA" (stop + block all future activations) — the way the legacy `HandlerAssistant` already does.

**Architecture:** Two **distinct** signals with different scopes, which must NOT be unified:

1. **Stop the running session NOW** → a per-`sessionId` Redis cancellation key (`agent:session-cancelled:{sessionId}`), set by **both** commands. The already-running BullMQ worker and its internal tool loop poll this key and bail out. It is keyed per session (not per contact) on purpose: a per-contact key would wrongly kill a *new* session created after a plain "Encerrar".
2. **Block future activations** → the persistent `contactsChannels.blockedAgent` flag (per contact+channel), set **only** by "Encerrar e bloquear". It is read at the V2 activation entry points (`HandlerAgent.execute()`/`resumeLoop()`), and ONCE at the start of each worker job to close the create-race (see Design decisions), so a block never leads to an agent reply.

Why both: the worker cannot key its cancellation off `blockedAgent`, because a plain "Encerrar" does not set that flag — the worker would miss the cancellation. Session-scoped cancel handles "stop this run"; contact-scoped block handles "never run again". Today neither exists for V2: `HandlerAgent`/`AgentSessionWorker` never read `blockedAgent`, and there is no cancellation key — V2 relies solely on `StopAssistant` deleting the session row, which leaves races (in-flight worker, multi-iteration tool loop, flag-set-but-session-recreated).

**Tech Stack:** Node.js, Express (chatfunnel-api), TypeScript (the `agents-v2/` subtree compiles to `dist/`), Prisma, Redis (`@redisAPI`), BullMQ, Jest + jest-mock-extended.

## Global Constraints

- Repo: `chatfunnel-api/` — pure JavaScript, EXCEPT the `agents-v2/` subtree which is TypeScript compiled to `dist/`. New runtime code inside `agents-v2/` is `.ts`. Code OUTSIDE that subtree (e.g. `commands/assistant/StopAssistant.js`) stays `.js` with CommonJS `require`, and reaches compiled TS via the `dist/` path (as it already does for `createHandlerAgent`).
- ALWAYS use module aliases (`@database`, `@redisAPI`, `@logger`, …) — never relative paths for aliased modules.
- The block flag is keyed by `contactId` + `channelId` (the natural key of `contactsChannels`), mirroring the legacy read at `HandlerAssistant.js:1078` / `:1652`.
- The cancel key is keyed by `sessionId` alone; prefix `agent:session-cancelled:` to match the existing `agent:*` prefixes in the `redis/` module (`agent:lock:`, `agent:debounce:`, `agent:session-create:`).
- NEVER connect to or run anything against a real database or a real Redis — all tests mock `@database` and `@redisAPI`.
- NEVER run production builds (`npm run build*`). Running `npm test` IS allowed; its `pretest` hook runs `tsc -p tsconfig.build.json` to emit `dist/`, required for the `@root/dist/...` and `../../../dist/...` imports.
- NEVER commit automatically — the plan contains no commit steps; the user commits manually.

## Context: how the legacy stop/block works (reference, do not modify)

- Flag lives in `contactsChannels.blockedAgent` (+ `blockedAgentAt/By/ById/ByName`), keyed by `contactId` + `channelId`.
- Written by: `StopAssistant.js:87-101` (only when `typeStop == "block_assistant"`) and `HandlerIGAutomation.js` (automation `BLOCK_ASSISTANT` step).
- Read (the legacy gate) ONLY by `HandlerAssistant.js`: `executeTrigger()` `:1071-1081` and `execute()` `:1645-1655` — `findFirst({where:{contactId,channelId}})` → `if (contactChannels?.blockedAgent) return null;`
- Cleared by: `UnblockAssistant.js` (already handles V2 — no change needed).
- `StopAssistant.js:128-147`: BOTH stop types already terminate the V2 session **when one is found** (`findByContactAndChannel` → `terminateSession({interrupted:true})`, which deletes the row and drains Redis). This plan ADDS the cancel-key set here so a running worker stops before/independently of the delete committing — and (Task 5) handles the create-race where `findByContactAndChannel` returned nothing because the session did not exist yet.

The live Agent V2 inbound path is `processorJob.js` → `handleActiveAgentSession.js` → `createHandlerAgent()` → `HandlerAgent.execute()`. `execute()`/`resumeLoop()` only ENQUEUE a BullMQ job (`HandlerAgent.ts:344-349`: "Does NOT call the LLM — the BullMQ worker handles that"); `AgentSessionWorker` calls the LLM, runs tools, persists and sends. Its in-process reprocess loop (`AgentSessionWorker.ts:336-347`) never re-enters `execute()`.

## File Structure

- **Create** `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/agentBlockGuard.ts` — one responsibility: given contact+channel, answer "is this contact's agent blocked?". Depends only on `@database`. (Future-activation gate + worker create-race read.)
- **Create** `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/agentBlockGuard.test.js` — unit tests.
- **Create** `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/redis/AgentSessionCancel.ts` — per-session cancellation key helper (`markCancelled`/`isCancelled`), mirroring `AgentDebounce`. (Stop-the-running-session signal.)
- **Create** `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/redis/AgentSessionCancel.test.js` — unit tests.
- **Modify** `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/redis/index.ts` — export the new singleton.
- **Modify** `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/HandlerAgent.ts` — guard `execute()` (~line 358) and `resumeLoop()` (~line 1602) with `isContactAgentBlocked`; add `shouldAbort?` to the abstract `executeToolLoop` signature (~line 299).
- **Modify** `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/providers/OpenAIHandlerAgent.ts` and `providers/AnthropicHandlerAgent.ts` — accept `shouldAbort?`, check it at the top of each tool-loop iteration AND before each tool in a batch (abort the whole loop via an `aborted` flag).
- **Modify** `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/queue/AgentSessionWorker.ts` — one-time `blockedAgent`+cancel read at job start (create-race → terminate the orphan session via `handler.terminateSession`), poll the cancel key at the top of the processing loop, pass `shouldAbort` into `executeToolLoop`, and fold the cancel check into the post-LLM guard.
- **Modify** `chatfunnel-api/src/commands/assistant/StopAssistant.js` — mark the current session cancelled (both stop types, best-effort) before `terminateSession`.
- **Modify** `chatfunnel-api/src/commands/assistant/StopAssistant.test.js` — virtual-mock the new `AgentSessionCancel` module (like the existing `createHandlerAgent` mock) and add order + Redis-failure-fallback tests.

## Out of scope (flagged follow-ups, do NOT implement here)

- `processor/handleServedByAgentV2.js` (alternate V2 path POSTing to NestJS) — not wired into `processorJob.js` today. If wired later, its NestJS executor needs the same two guards. Note in the PR description.
- `HandlerAgent.executeTrigger()` (`:1790`) — currently a stub. Add the block guard when it is implemented. Note in the PR description.

## Design decisions (ponytail)

- **Create-race:** `execute()` reads `blockedAgent=false` → user blocks → `StopAssistant` finds no session yet (so it neither terminates nor sets a cancel key) → `execute()` then creates the session → a worker job starts with no cancel key. Closed by reading `blockedAgent` **once at the start of each worker job** (one DB read per job, alongside the cancel-key read). Because `StopAssistant` never terminated that session, the worker must terminate the orphan itself (Task 5 Step 6) — reusing `handler.terminateSession` so buffer/debounce/lock/expiration/endSession-lifecycle are all cleaned, exactly as a normal stop would. All *mid-job* stops go through `StopAssistant`, which sets the cancel key, so the loop/tool/post-LLM guards only need the cheap Redis `isCancelled` read — no repeated DB reads.
- **Cancel-key TTL = `3600` s (1 h).** A single job can span multiple `callLLM` calls (30–90 s each), several tool iterations with slow external HTTP, and BullMQ retries (`attempts: 3`, exponential backoff) — 600 s could be exceeded. The key is per-`sessionId`, so a long TTL never risks blocking a future session. No explicit `clear()`: a sessionId never recurs, so TTL auto-cleanup is enough.
- **Tool-loop cancellation is checked in two places** (both cheap Redis GETs): at the top of each `while` iteration (a cancel that landed during the previous iteration's internal `callLLM`) AND before each tool in the current batch (a single tool can be a multi-second external call, so waiting for the next iteration is not acceptable). Breaking the inner `for` alone would still let the provider run the trailing `callLLM`, so an `aborted` flag also breaks the `while`. A tool already in flight is NOT interrupted — only subsequent tools/iterations.
- **Post-LLM guard keeps BOTH `findById` and `isCancelled`:** `findById` covers other terminate paths (expiration, rating timeout, exhausted retries) that do not go through `StopAssistant` and so never set the cancel key.
- **`StopAssistant` marks the cancel key best-effort** (`.catch`): if Redis is unavailable, the endpoint must still delete the session; the worker's `findById` guard then discards the response as a fallback.

---

### Task 1: Reusable `isContactAgentBlocked` guard function

**Files:**
- Create: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/agentBlockGuard.ts`
- Test: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/agentBlockGuard.test.js`

**Interfaces:**
- Consumes: `@database` — `prisma.contactsChannels.findFirst`.
- Produces: `export async function isContactAgentBlocked(contactId: string | undefined, channelId: string | undefined): Promise<boolean>` — `true` only when a `contactsChannels` row exists for the pair and `blockedAgent === true`; `false` when either id is missing or no row/flag. Tasks 2 and 5 import this exact signature.

- [ ] **Step 1: Write the failing test**

Create `agentBlockGuard.test.js`:

```js
const prisma = require("@database");
const {
  isContactAgentBlocked,
} = require("@root/dist/processor/agents-v2/agentBlockGuard");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("isContactAgentBlocked", () => {
  it("returns false and does not query when contactId is missing", async () => {
    const result = await isContactAgentBlocked(undefined, "CHANNEL_ID");
    expect(result).toBe(false);
    expect(prisma.contactsChannels.findFirst).not.toHaveBeenCalled();
  });

  it("returns false and does not query when channelId is missing", async () => {
    const result = await isContactAgentBlocked("CONTACT_ID", undefined);
    expect(result).toBe(false);
    expect(prisma.contactsChannels.findFirst).not.toHaveBeenCalled();
  });

  it("returns false when no contactsChannels row exists", async () => {
    prisma.contactsChannels.findFirst.mockResolvedValue(null);
    const result = await isContactAgentBlocked("CONTACT_ID", "CHANNEL_ID");
    expect(result).toBe(false);
  });

  it("returns false when blockedAgent is false", async () => {
    prisma.contactsChannels.findFirst.mockResolvedValue({ blockedAgent: false });
    const result = await isContactAgentBlocked("CONTACT_ID", "CHANNEL_ID");
    expect(result).toBe(false);
  });

  it("returns true when blockedAgent is true", async () => {
    prisma.contactsChannels.findFirst.mockResolvedValue({ blockedAgent: true });
    const result = await isContactAgentBlocked("CONTACT_ID", "CHANNEL_ID");
    expect(result).toBe(true);
    expect(prisma.contactsChannels.findFirst).toHaveBeenCalledWith({
      where: { contactId: "CONTACT_ID", channelId: "CHANNEL_ID" },
      select: { blockedAgent: true },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chatfunnel-api && npm test -- agentBlockGuard`
Expected: FAIL — `Cannot find module '@root/dist/processor/agents-v2/agentBlockGuard'` (source does not exist yet, so `pretest`'s `tsc` emits nothing for it).

- [ ] **Step 3: Write minimal implementation**

Create `agentBlockGuard.ts`:

```ts
import prisma = require("@database");

/**
 * True when this contact's agent is blocked (the "Encerrar e bloquear IA"
 * action, or a BLOCK_ASSISTANT automation step, set contactsChannels.blockedAgent).
 * Mirrors the legacy gate in HandlerAssistant so the V2 runtime honors the same
 * block on FUTURE activations. Missing ids => not blocked (cannot identify).
 */
export async function isContactAgentBlocked(
  contactId: string | undefined,
  channelId: string | undefined,
): Promise<boolean> {
  if (!contactId || !channelId) return false;

  const contactChannel = await prisma.contactsChannels.findFirst({
    where: { contactId, channelId },
    select: { blockedAgent: true },
  });

  return contactChannel?.blockedAgent === true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd chatfunnel-api && npm test -- agentBlockGuard`
Expected: PASS — 5 passing tests.

---

### Task 2: Block future activations in `HandlerAgent.execute()` and `resumeLoop()`

**Files:**
- Modify: `HandlerAgent.ts` (import near line 1; guard in `execute()` at ~line 358; guard in `resumeLoop()` at ~line 1602)

**Interfaces:**
- Consumes: `isContactAgentBlocked(contactId, channelId)` from Task 1 (`./agentBlockGuard`); `this.context.contact?.id`, `this.context.channel?.id` (already used throughout `HandlerAgent`); `this.addLog(tag, info)`.
- Produces: no new exports. Both methods early-`return` (they are `Promise<void>`) before loading the agent / touching the session when the contact is blocked.

- [ ] **Step 1: Add the import**

In `HandlerAgent.ts`, immediately after `import prisma = require("@database");` (line 1), add:

```ts
import { isContactAgentBlocked } from "./agentBlockGuard";
```

- [ ] **Step 2: Guard `execute()`**

`execute()` currently starts (lines 358-362):

```ts
    const { agentId, fromBroadcast, broadcastMessageId, existingSession } =
      options;

    const agent = await this.loadAgent(agentId);
    if (!agent) return;
```

Insert the guard between the destructure and `loadAgent`:

```ts
    const { agentId, fromBroadcast, broadcastMessageId, existingSession } =
      options;

    if (
      await isContactAgentBlocked(
        this.context.contact?.id,
        this.context.channel?.id,
      )
    ) {
      this.addLog("execute", "agent blocked for contact, skipping");
      return;
    }

    const agent = await this.loadAgent(agentId);
    if (!agent) return;
```

- [ ] **Step 3: Guard `resumeLoop()`**

`resumeLoop()` currently starts (lines 1602-1608):

```ts
  async resumeLoop(sessionId: string): Promise<void> {
    const session = await sessionsRepo.findById(sessionId);
    if (!session) {
      this.addLog("resumeLoop", `session not found session=${sessionId}`);
      return;
    }
    this.session = session;
```

Insert the guard as the first statement:

```ts
  async resumeLoop(sessionId: string): Promise<void> {
    if (
      await isContactAgentBlocked(
        this.context.contact?.id,
        this.context.channel?.id,
      )
    ) {
      this.addLog("resumeLoop", "agent blocked for contact, skipping");
      return;
    }

    const session = await sessionsRepo.findById(sessionId);
    if (!session) {
      this.addLog("resumeLoop", `session not found session=${sessionId}`);
      return;
    }
    this.session = session;
```

- [ ] **Step 4: Verify TypeScript compiles and existing agents-v2 tests stay green**

Run: `cd chatfunnel-api && npm test -- agents-v2`
Expected: PASS — no `tsc` errors from `pretest`; existing suite (`splitMessage`, `structuredResponse`, `agentBlockGuard`) green. `Cannot find module './agentBlockGuard'` means the import path is wrong; fix before continuing.

---

### Task 3: `AgentSessionCancel` Redis helper (stop-the-running-session signal)

**Files:**
- Create: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/redis/AgentSessionCancel.ts`
- Test: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/redis/AgentSessionCancel.test.js`
- Modify: `redis/index.ts`

**Interfaces:**
- Consumes: `@redisAPI` — `redis.client.set(key, value, { EX })`, `redis.client.exists(key)` (same API used by `AgentDebounce`/`AgentSessionLock`).
- Produces:
  - `export const agentSessionCancel` — singleton of `class AgentSessionCancel` with:
    - `markCancelled(sessionId: string, ttlSeconds?: number): Promise<void>` — sets `agent:session-cancelled:{sessionId}` = `"1"` with TTL (default `3600`).
    - `isCancelled(sessionId: string): Promise<boolean>` — `true` iff the key exists.
  - Re-exported from `redis/index.ts` so `import { agentSessionCancel } from "../redis"` works (Task 5) and `require(".../dist/.../redis/AgentSessionCancel")` works (Task 4).

- [ ] **Step 1: Write the failing test**

Create `redis/AgentSessionCancel.test.js`:

```js
jest.mock("@redisAPI", () => ({
  client: {
    set: jest.fn(),
    exists: jest.fn(),
    sendCommand: jest.fn(),
  },
}));

const redis = require("@redisAPI");
const {
  agentSessionCancel,
} = require("@root/dist/processor/agents-v2/redis/AgentSessionCancel");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("agentSessionCancel", () => {
  it("markCancelled sets the per-session key with the default 1h TTL", async () => {
    await agentSessionCancel.markCancelled("SESSION_ID");
    expect(redis.client.set).toHaveBeenCalledWith(
      "agent:session-cancelled:SESSION_ID",
      "1",
      { EX: 3600 },
    );
  });

  it("markCancelled honors a custom TTL", async () => {
    await agentSessionCancel.markCancelled("SESSION_ID", 30);
    expect(redis.client.set).toHaveBeenCalledWith(
      "agent:session-cancelled:SESSION_ID",
      "1",
      { EX: 30 },
    );
  });

  it("isCancelled returns true when the key exists", async () => {
    redis.client.exists.mockResolvedValue(1);
    const result = await agentSessionCancel.isCancelled("SESSION_ID");
    expect(result).toBe(true);
    expect(redis.client.exists).toHaveBeenCalledWith(
      "agent:session-cancelled:SESSION_ID",
    );
  });

  it("isCancelled returns false when the key is absent", async () => {
    redis.client.exists.mockResolvedValue(0);
    const result = await agentSessionCancel.isCancelled("SESSION_ID");
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd chatfunnel-api && npm test -- AgentSessionCancel`
Expected: FAIL — `Cannot find module '@root/dist/processor/agents-v2/redis/AgentSessionCancel'`.

- [ ] **Step 3: Write minimal implementation**

Create `redis/AgentSessionCancel.ts` (mirrors `AgentDebounce.ts`):

```ts
import redis = require("@redisAPI");

const CANCEL_PREFIX = "agent:session-cancelled:";
const CANCEL_TTL = 3600;

/**
 * Per-session cancellation flag.
 *
 * Set by BOTH stop commands ("Encerrar" and "Encerrar e bloquear") when a live
 * session is terminated, so an already-running AgentSessionWorker (and its tool
 * loop) can bail out mid-flight instead of racing the session-row deletion.
 *
 * Keyed by sessionId ALONE — never by contact — so it can only stop the exact
 * run it targets and never leaks into a fresh session created afterwards.
 * TTL-only cleanup (1 h, comfortably above worst-case job duration incl. BullMQ
 * retries): a sessionId never recurs, so no explicit clear is needed.
 */
class AgentSessionCancel {
  private cancelKey(sessionId: string): string {
    return `${CANCEL_PREFIX}${sessionId}`;
  }

  async markCancelled(
    sessionId: string,
    ttlSeconds = CANCEL_TTL,
  ): Promise<void> {
    await redis.client.set(this.cancelKey(sessionId), "1", { EX: ttlSeconds });
  }

  async isCancelled(sessionId: string): Promise<boolean> {
    const result = await redis.client.exists(this.cancelKey(sessionId));
    return result === 1;
  }
}

export const agentSessionCancel = new AgentSessionCancel();
```

- [ ] **Step 4: Export it from the redis barrel**

`redis/index.ts` currently ends with:

```ts
export { agentLoopDetector } from "./AgentLoopDetector";
```

Add:

```ts
export { agentLoopDetector } from "./AgentLoopDetector";
export { agentSessionCancel } from "./AgentSessionCancel";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd chatfunnel-api && npm test -- AgentSessionCancel`
Expected: PASS — 4 passing tests.

---

### Task 4: Set the cancel key in `StopAssistant` (both commands, best-effort)

**Files:**
- Modify: `chatfunnel-api/src/commands/assistant/StopAssistant.js` (top-of-file require ~line 7; inside the `if (agentSession)` block, ~lines 133-147)
- Test: `chatfunnel-api/src/commands/assistant/StopAssistant.test.js` (existing harness — virtual-mocks `createHandlerAgent` at lines 1-15; add the parallel mock + two cases)

**Interfaces:**
- Consumes: `agentSessionCancel.markCancelled(sessionId)` from Task 3, loaded from `dist` (this file is JS and already loads V2 code from `dist`, e.g. `createHandlerAgent` at `:135-136`); `agentSession.id`; `@logger` (Winston `LoggerClass`, `.agent(severity, msg)` — same API the worker uses).
- Produces: no new exports. Side effect only — the cancel key is set (best-effort) before `terminateSession` for every stop that has a live V2 session, regardless of `typeStop`.

- [ ] **Step 1: Add the failing tests (and the virtual mock the new require needs)**

In `StopAssistant.test.js`, the new `require("../../../dist/.../AgentSessionCancel")` would otherwise load the compiled module and pull in the real `@redisAPI`. Mock it virtually, exactly like `createHandlerAgent`. Immediately after the existing `createHandlerAgent` mock block (line 15), add:

```js
// Agent V2 cancel key (dist artifact). markCancelled returns a resolved promise
// so the production `.catch(...)` chain works; a rejecting variant drives the
// Redis-failure fallback test below.
const mockMarkCancelled = jest.fn(async () => undefined);
jest.mock(
  "../../../dist/processor/agents-v2/redis/AgentSessionCancel",
  () => ({ agentSessionCancel: { markCancelled: mockMarkCancelled } }),
  { virtual: true },
);
```

Then add two cases inside `describe("StopAssistant", ...)`:

```js
  it("marks the V2 session cancelled BEFORE terminating it", async () => {
    primeValidation();
    mockFindByContactAndChannel.mockResolvedValue({
      id: "sess-1",
      agentId: AGENT_ID,
    });

    await stopAssistant(makeReq(), makeRes());

    expect(mockMarkCancelled).toHaveBeenCalledWith("sess-1");
    expect(mockTerminateSession).toHaveBeenCalled();
    expect(mockMarkCancelled.mock.invocationCallOrder[0]).toBeLessThan(
      mockTerminateSession.mock.invocationCallOrder[0],
    );
  });

  it("still terminates the session when the cancel-key write fails (Redis down)", async () => {
    primeValidation();
    mockFindByContactAndChannel.mockResolvedValue({
      id: "sess-1",
      agentId: AGENT_ID,
    });
    mockMarkCancelled.mockRejectedValueOnce(new Error("Redis unavailable"));
    const res = makeRes();

    await stopAssistant(makeReq(), res);

    expect(mockTerminateSession).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd chatfunnel-api && npm test -- StopAssistant`
Expected: FAIL — `mockMarkCancelled` is never called (source not yet changed), so the first new case fails the `toHaveBeenCalledWith("sess-1")`/order assertions. (The existing cases still pass.)

- [ ] **Step 3: Add the logger require (source)**

`StopAssistant.js` top requires currently end at line 7:

```js
const { redisService } = require("@services");
```

Add the logger (used for the best-effort catch below):

```js
const { redisService } = require("@services");
const Logger = require("@logger");
```

- [ ] **Step 4: Mark the session cancelled (best-effort) before terminating it (source)**

The block currently reads (lines 133-147):

```js
  if (agentSession) {
    const {
      createHandlerAgent,
    } = require("../../../dist/processor/agents-v2/createHandlerAgent");

    const handlerAgent = await createHandlerAgent(
      agentSession.agentId,
      context,
    );
    await handlerAgent.loadAgent(agentSession.agentId);
    handlerAgent.setSession(agentSession);
    await handlerAgent.terminateSession({
      interrupted: true,
      endReason: "INTERRUPTED",
    });
  } else {
```

Change it to set the cancel key first, best-effort, so a worker already processing this session stops before/independently of the row deletion committing — and a Redis outage does NOT block the session teardown:

```js
  if (agentSession) {
    const {
      createHandlerAgent,
    } = require("../../../dist/processor/agents-v2/createHandlerAgent");
    const {
      agentSessionCancel,
    } = require("../../../dist/processor/agents-v2/redis/AgentSessionCancel");

    // Signal the running worker (and its tool loop) to bail out. Set for BOTH
    // "Encerrar" and "Encerrar e bloquear" — the blockedAgent flag above only
    // covers future activations, not the in-flight run. Best-effort: if Redis
    // is down, terminateSession below still deletes the row and the worker's
    // findById guard discards the response as a fallback.
    await agentSessionCancel.markCancelled(agentSession.id).catch((err) => {
      new Logger("StopAssistant").agent(
        "error",
        `failed to mark session cancelled — sessionId=${agentSession.id} err=${err}`,
      );
    });

    const handlerAgent = await createHandlerAgent(
      agentSession.agentId,
      context,
    );
    await handlerAgent.loadAgent(agentSession.agentId);
    handlerAgent.setSession(agentSession);
    await handlerAgent.terminateSession({
      interrupted: true,
      endReason: "INTERRUPTED",
    });
  } else {
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd chatfunnel-api && npm test -- StopAssistant`
Expected: PASS — all cases, including the two new ones and the pre-existing suite. If `Cannot find module '../../../dist/.../AgentSessionCancel'` appears at runtime outside the test (e.g. a smoke run), Task 3 was not built; run `npm test` once to trigger `pretest`.

---

### Task 5: Enforce cancellation (and close the create-race) in `AgentSessionWorker` and the tool loop

**Files:**
- Modify: `HandlerAgent.ts` (abstract `executeToolLoop` signature, ~line 299)
- Modify: `providers/OpenAIHandlerAgent.ts` (`executeToolLoop`, ~lines 251-345) and `providers/AnthropicHandlerAgent.ts` (`executeToolLoop`, ~lines 284-383)
- Modify: `queue/AgentSessionWorker.ts` (imports ~line 10; destructure ~line 63; job-start guard ~line 108; loop guard ~line 237; tool call ~line 282; post-LLM guard ~line 300)

**Interfaces:**
- Consumes: `agentSessionCancel.isCancelled(sessionId)` from Task 3 (`../redis`); `isContactAgentBlocked(contactId, channelId)` from Task 1 (`../agentBlockGuard`); `sessionId`/`contactId`/`channelId` (all on `ProcessSessionJobData`, destructured from `job.data`); `handler.terminateSession({interrupted, endReason})` (existing); `alog(...)`; `session` (already loaded in each provider's `executeToolLoop`).
- Produces: the abstract and both concrete `executeToolLoop` gain a 5th optional param `shouldAbort?: () => Promise<boolean>`. No other new exports.

- [ ] **Step 1: Add `shouldAbort` to the abstract signature**

`HandlerAgent.ts` abstract declaration currently (lines 299-304):

```ts
  abstract executeToolLoop(
    session: AgentSessions,
    messages: LLMMessage[],
    options: LLMCallOptions,
    initialResponse: LLMResponse,
  ): Promise<LLMResponse>;
```

Change to:

```ts
  abstract executeToolLoop(
    session: AgentSessions,
    messages: LLMMessage[],
    options: LLMCallOptions,
    initialResponse: LLMResponse,
    shouldAbort?: () => Promise<boolean>,
  ): Promise<LLMResponse>;
```

- [ ] **Step 2: Honor `shouldAbort` in `OpenAIHandlerAgent.executeToolLoop`**

**2a — signature** (lines 251-256):

```ts
  async executeToolLoop(
    session: AgentSessions,
    messages: LLMMessage[],
    options: LLMCallOptions,
    initialResponse: LLMResponse,
  ): Promise<LLMResponse> {
```

becomes:

```ts
  async executeToolLoop(
    session: AgentSessions,
    messages: LLMMessage[],
    options: LLMCallOptions,
    initialResponse: LLMResponse,
    shouldAbort?: () => Promise<boolean>,
  ): Promise<LLMResponse> {
```

**2b — top-of-iteration check + per-tool abort flag.** The loop currently begins (lines 264-283):

```ts
      while (
        response.finishReason === "tool_use" &&
        response.toolCalls.length > 0 &&
        iteration < MAX_TOOL_ITERATIONS
      ) {
        iteration++;

        await this.persistSessionMessage(
          session.id,
          "ASSISTANT",
          response.content ?? "",
          response.toolCalls,
        );
        currentMessages.push({
          role: "assistant",
          content: response.content ?? "",
          toolCalls: response.toolCalls,
        });

        for (const toolCall of response.toolCalls) {
```

becomes (add the entry check, then declare `aborted` and check it before each tool):

```ts
      while (
        response.finishReason === "tool_use" &&
        response.toolCalls.length > 0 &&
        iteration < MAX_TOOL_ITERATIONS
      ) {
        if (await shouldAbort?.()) {
          this.addLog("executeToolLoop", "aborted: session cancelled");
          break;
        }
        iteration++;

        await this.persistSessionMessage(
          session.id,
          "ASSISTANT",
          response.content ?? "",
          response.toolCalls,
        );
        currentMessages.push({
          role: "assistant",
          content: response.content ?? "",
          toolCalls: response.toolCalls,
        });

        let aborted = false;
        for (const toolCall of response.toolCalls) {
          if (await shouldAbort?.()) {
            aborted = true;
            this.addLog(
              "executeToolLoop",
              "aborted before next tool: session cancelled",
            );
            break;
          }
```

**2c — break the `while` when a tool batch was aborted.** After the `for` loop closes, the code currently reads (lines 333-338):

```ts
        }

        const stillOwner = await agentSessionLock.refresh(
          session.id,
          this.ownerId!,
        );
```

becomes:

```ts
        }

        if (aborted) break;

        const stillOwner = await agentSessionLock.refresh(
          session.id,
          this.ownerId!,
        );
```

- [ ] **Step 3: Honor `shouldAbort` in `AnthropicHandlerAgent.executeToolLoop`**

Identical shape to Step 2 (same three edits).

**3a — signature** (lines 284-289):

```ts
  async executeToolLoop(
    session: AgentSessions,
    messages: LLMMessage[],
    options: LLMCallOptions,
    initialResponse: LLMResponse,
  ): Promise<LLMResponse> {
```

becomes:

```ts
  async executeToolLoop(
    session: AgentSessions,
    messages: LLMMessage[],
    options: LLMCallOptions,
    initialResponse: LLMResponse,
    shouldAbort?: () => Promise<boolean>,
  ): Promise<LLMResponse> {
```

**3b — top-of-iteration check + per-tool abort flag.** The loop currently begins (lines 297-321):

```ts
      while (
        response.finishReason === "tool_use" &&
        response.toolCalls.length > 0 &&
        iteration < MAX_TOOL_ITERATIONS
      ) {
        iteration++;

        // Persist and append the assistant message with tool call requests
        await this.persistSessionMessage(
          session.id,
          "ASSISTANT",
          response.content ?? "",
          response.toolCalls,
        );
        currentMessages.push({
          role: "assistant",
          content: response.content ?? "",
          toolCalls: response.toolCalls,
        });

        // Execute all tool calls and persist each result individually to DB,
        // but append them as a single "tool" batch for Anthropic's protocol
        // (toAnthropicMessages will merge consecutive tool messages into one
        // user message with tool_result blocks)
        for (const toolCall of response.toolCalls) {
```

becomes:

```ts
      while (
        response.finishReason === "tool_use" &&
        response.toolCalls.length > 0 &&
        iteration < MAX_TOOL_ITERATIONS
      ) {
        if (await shouldAbort?.()) {
          this.addLog("executeToolLoop", "aborted: session cancelled");
          break;
        }
        iteration++;

        // Persist and append the assistant message with tool call requests
        await this.persistSessionMessage(
          session.id,
          "ASSISTANT",
          response.content ?? "",
          response.toolCalls,
        );
        currentMessages.push({
          role: "assistant",
          content: response.content ?? "",
          toolCalls: response.toolCalls,
        });

        // Execute all tool calls and persist each result individually to DB,
        // but append them as a single "tool" batch for Anthropic's protocol
        // (toAnthropicMessages will merge consecutive tool messages into one
        // user message with tool_result blocks)
        let aborted = false;
        for (const toolCall of response.toolCalls) {
          if (await shouldAbort?.()) {
            aborted = true;
            this.addLog(
              "executeToolLoop",
              "aborted before next tool: session cancelled",
            );
            break;
          }
```

**3c — break the `while` when a tool batch was aborted.** After the `for` loop closes, the code currently reads (lines 371-376):

```ts
        }

        const stillOwner = await agentSessionLock.refresh(
          session.id,
          this.ownerId!,
        );
```

becomes:

```ts
        }

        if (aborted) break;

        const stillOwner = await agentSessionLock.refresh(
          session.id,
          this.ownerId!,
        );
```

- [ ] **Step 4: Add the worker imports**

In `AgentSessionWorker.ts`, the current redis import (lines 10-15):

```ts
import {
  agentSessionLock,
  agentMessageBuffer,
  agentDebounce,
  agentLoopDetector,
} from "../redis";
```

becomes (add the cancel helper, and import the block guard from the parent dir):

```ts
import {
  agentSessionLock,
  agentMessageBuffer,
  agentDebounce,
  agentLoopDetector,
  agentSessionCancel,
} from "../redis";
import { isContactAgentBlocked } from "../agentBlockGuard";
```

- [ ] **Step 5: Destructure `contactId`/`channelId` from the job payload**

`processSessionJob` currently destructures (line 63):

```ts
  const { sessionId, agentId, accountId, contextSnapshot, step, trigger } =
    job.data;
```

Add `contactId` and `channelId` (already required fields on `ProcessSessionJobData`):

```ts
  const { sessionId, agentId, accountId, contactId, channelId, contextSnapshot, step, trigger } =
    job.data;
```

- [ ] **Step 6: One-time create-race guard at job start (terminate the orphan)**

The handler is set up just before the service-hours guard (lines 100-110):

```ts
  const handler =
    agent.providerType === "OPENAI"
      ? new OpenAIHandlerAgent(contextSnapshot, step, trigger)
      : new AnthropicHandlerAgent(contextSnapshot, step, trigger);

  await handler.loadAgent(agentId);
  handler.setSession(session);
  handler.setOwnerId(ownerId);

  // 4. Guard — skip processing if outside configured service hours
  if (!handler.isWithinServiceHours()) {
```

Insert the combined guard right after `handler.setOwnerId(ownerId);` (one Redis + one DB read per job). Check `cancelledAtStart` FIRST — if a mid-flight `StopAssistant` set the cancel key it also deleted the session, so there is nothing to terminate; only the create-race (`blockedAtStart` with no cancel key) needs the worker to terminate the orphan it inherited:

```ts
  await handler.loadAgent(agentId);
  handler.setSession(session);
  handler.setOwnerId(ownerId);

  // Stop before any work if this run was cancelled, or the contact was blocked
  // while execute() was still creating this session (create-race). One read each.
  const [cancelledAtStart, blockedAtStart] = await Promise.all([
    agentSessionCancel.isCancelled(sessionId),
    isContactAgentBlocked(contactId, channelId),
  ]);
  if (cancelledAtStart) {
    // StopAssistant already terminated this session; nothing left to do.
    alog(
      "info",
      `[AgentSessionWorker] session cancelled at start, skipping — sessionId=${sessionId}`,
    );
    return;
  }
  if (blockedAtStart) {
    // Create-race: StopAssistant found no session to terminate (it did not exist
    // yet), so finish the "block" here — full teardown via terminateSession
    // (buffer/debounce/lock/expiration/endSession), the same routine StopAssistant
    // would have run. markCancelled guards a sibling job, best-effort.
    alog(
      "info",
      `[AgentSessionWorker] contact blocked during session creation, terminating orphan — sessionId=${sessionId}`,
    );
    await agentSessionCancel.markCancelled(sessionId).catch(() => {});
    await handler.terminateSession({
      interrupted: true,
      endReason: "INTERRUPTED",
    });
    return;
  }

  // 4. Guard — skip processing if outside configured service hours
  if (!handler.isWithinServiceHours()) {
```

- [ ] **Step 7: Guard the top of the processing loop (cancel key only)**

Inside the `while (true)` loop, the code between the loop-detector block and the lifecycle automations currently reads (lines 237-244):

```ts
      // Fire lifecycle automations after persist, before LLM call
      if (isFirstInteraction) {
        await handler.handleLifecycleAutomations("firstInteraction");
      }
      await handler.handleLifecycleAutomations("everyMessage");

      await handler.prepareReferenceFiles();
      await handler.prepareMcpTools();
```

Insert the cancel guard before the automations (runs every iteration incl. reprocess loops — cheap Redis GET, stops LLM cost, tools and automations for a cancelled session):

```ts
      if (await agentSessionCancel.isCancelled(sessionId)) {
        alog(
          "info",
          `[AgentSessionWorker] session cancelled, skipping before automations/LLM — sessionId=${sessionId}`,
        );
        break;
      }

      // Fire lifecycle automations after persist, before LLM call
      if (isFirstInteraction) {
        await handler.handleLifecycleAutomations("firstInteraction");
      }
      await handler.handleLifecycleAutomations("everyMessage");

      await handler.prepareReferenceFiles();
      await handler.prepareMcpTools();
```

- [ ] **Step 8: Pass `shouldAbort` into `executeToolLoop`**

The tool-use branch currently reads (lines 281-289):

```ts
      // Run the tool call → execute → call cycle if the model requested tool use
      if (response.finishReason === "tool_use") {
        response = await handler.executeToolLoop(
          session,
          llmMessages,
          options,
          response,
        );
      }
```

Pass the cancel poll so tools stop between iterations AND before each tool of a multi-round tool loop:

```ts
      // Run the tool call → execute → call cycle if the model requested tool use.
      // shouldAbort lets the loop bail if the session is cancelled mid-flight
      // (a tool already in progress cannot be undone; the next one is skipped).
      if (response.finishReason === "tool_use") {
        response = await handler.executeToolLoop(
          session,
          llmMessages,
          options,
          response,
          () => agentSessionCancel.isCancelled(sessionId),
        );
      }
```

- [ ] **Step 9: Fold the cancel check into the post-LLM guard**

The post-LLM session guard currently reads (lines 300-306):

```ts
      if (!(await sessionsRepo.findById(sessionId))) {
        alog(
          "info",
          `[AgentSessionWorker] session terminated during processing, discarding — sessionId=${sessionId}`,
        );
        break;
      }
```

Replace it with a combined check (kept alongside `findById`, which still covers non-StopAssistant terminate paths — expiration, rating timeout, exhausted retries — that never set the cancel key):

```ts
      const [activeSession, cancelled] = await Promise.all([
        sessionsRepo.findById(sessionId),
        agentSessionCancel.isCancelled(sessionId),
      ]);
      if (!activeSession || cancelled) {
        alog(
          "info",
          `[AgentSessionWorker] response discarded — sessionId=${sessionId} reason=${
            cancelled ? "session-cancelled" : "session-terminated"
          }`,
        );
        break;
      }
```

- [ ] **Step 10: Verify TypeScript compiles and existing agents-v2 tests stay green**

Run: `cd chatfunnel-api && npm test -- agents-v2`
Expected: PASS — no `tsc` errors from `pretest`; existing suite plus the new `agentBlockGuard` and `AgentSessionCancel` tests all green. A signature mismatch (`Expected 4 arguments, but got 5`) means the abstract/provider signatures in Steps 1-3 were not all updated; fix before continuing.

---

## Self-Review

**1. Spec coverage** — the two commands:
- "Encerrar agente" — stops the current session (cancel key set by both branches of Task 4) and does NOT block future activations (`blockedAgent` untouched) ✓
- "Encerrar e bloquear IA" — stops the current session (Task 4) AND blocks future activations (`blockedAgent` set by legacy `StopAssistant:87-101`, enforced by Task 2 at entry + Task 5 Step 6 at job start) ✓
- Create-race (block set while `execute()` is creating the session) — closed by the one-time `blockedAgent` read at job start; the orphan session is fully terminated via `handler.terminateSession` (Task 5 Step 6), not merely skipped ✓
- Running worker honors cancellation before automations/LLM (Step 7), inside the multi-iteration tool loop AND before each tool of a batch (Steps 1-3, 8), and before persist/send (Step 9) ✓
- Redis outage does not block session teardown — best-effort `markCancelled` (Task 4 Step 4); `findById` fallback still discards ✓
- Unblock path — already handled by `UnblockAssistant.js`, no change needed ✓
- Non-live paths (`handleServedByAgentV2`, `executeTrigger` stub) — deferred with rationale ✓ (Out of scope)

**2. Placeholder scan** — every step has full file contents / exact edits / exact commands with expected output. No TBD/TODO. ✓

**3. Type consistency** —
- `isContactAgentBlocked(contactId, channelId): Promise<boolean>` (Task 1) is called with `(this.context.contact?.id, this.context.channel?.id)` in Task 2 (both `string | undefined`) and `(contactId, channelId)` in Task 5 Step 6 (`string` from `ProcessSessionJobData`) — both assignable. ✓
- `agentSessionCancel.markCancelled(sessionId)` (Task 3) is called with `agentSession.id` in Task 4 and `sessionId` in Task 5 Step 6; key format `agent:session-cancelled:{sessionId}` and default TTL `3600` match both the helper test and the StopAssistant test's `toHaveBeenCalledWith`. ✓
- `agentSessionCancel.isCancelled(sessionId): Promise<boolean>` (Task 3) is used in Task 5 Steps 6/7/9 and wrapped as `() => agentSessionCancel.isCancelled(sessionId)` for the `shouldAbort?: () => Promise<boolean>` param — types match. ✓
- The abstract `executeToolLoop` (Step 1), both concrete overrides (Steps 2a/3a), and the call site (Step 8) all agree on the 5-arg signature ending in `shouldAbort?`. The `aborted` flag is a local `let` declared before each `for` and read by the `if (aborted) break;` after it (Steps 2b/2c, 3b/3c). ✓
- `handler.terminateSession({interrupted, endReason})` in Task 5 Step 6 matches the existing call in `StopAssistant.js:144` and the worker's failed-handler. ✓

**4. Test-coverage decision** — the risky *logic* is unit-tested: the block predicate (Task 1), the cancel helper (Task 3), and — because a harness already exists — `StopAssistant`'s ordering + Redis-failure fallback (Task 4). The remaining wiring lives in `AgentSessionWorker`/`HandlerAgent`/providers, which have no behavioral harness today and whose entry (`processSessionJob`) is not exported; that wiring is verified by `tsc` at `pretest` + the existing `agents-v2` suite + the manual verification below. A full worker integration test is deferred (YAGNI); if wanted later, export `processSessionJob`, `jest.mock` the providers + `../redis` + `../agentBlockGuard`, and assert `sendResponseToContact` is NOT called (and, for the create-race, `terminateSession` IS called) when the guards trip.

## Manual verification (optional, after merge — user runs the app)

1. **Encerrar simples:** open a livechat with a contact served by a V2 agent; click "Encerrar agente". Then fire a trigger/send a new inbound → the agent DOES respond again (new session; block never set).
2. **Encerrar e bloquear:** click "Encerrar e bloquear IA", then send a new inbound → the agent does NOT respond; log shows `execute ... agent blocked for contact, skipping` (or `contact blocked during session creation, terminating orphan` if the create-race hit). Fire a trigger → still blocked.
3. **Race (worker running):** send a message and, while the agent is "typing"/processing, click either stop command → no assistant message is persisted or sent; log shows `[AgentSessionWorker] response discarded ... reason=session-cancelled` (or `... skipping before automations/LLM`, or `executeToolLoop aborted ...` if a multi-round tool loop was in flight). Note: a tool call **already in flight completes and cannot be undone** — only the *next* tool in the batch and any subsequent iterations are stopped.
4. **Unblock:** click "Retomar"/unblock (or `POST /accounts/unblock_assistant/...`) → a new inbound is answered by the agent again.
```
