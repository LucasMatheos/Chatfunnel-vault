# Agent V2 Block Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the per-contact `blockedAgent` flag actually stop Agent V2 execution, the same way it already stops the legacy `HandlerAssistant`.

**Architecture:** Today only the legacy `HandlerAssistant.execute()`/`executeTrigger()` read `contactsChannels.blockedAgent` and bail out. The Agent V2 runtime never reads it anywhere — it relies entirely on session deletion (`StopAssistant` deletes the V2 session) to stop responding, which leaves real gaps. We add one reusable guard function and enforce it at **three** places:

1. `HandlerAgent.execute()` and `HandlerAgent.resumeLoop()` — cheap early-out that stops a blocked contact from ever scheduling a worker job.
2. `AgentSessionWorker` (the BullMQ worker that actually calls the LLM) — because `execute()`/`resumeLoop()` only *enqueue* a job (`HandlerAgent.ts:344-349`: "Does NOT call the LLM — the BullMQ worker handles that"); the worker's in-process reprocess loop (`AgentSessionWorker.ts:336-347`) re-consumes buffered messages **without re-entering `execute()`**, so a guard in `execute()` alone cannot stop a worker that is already running.

The two enforcement layers are intentional: the `execute()` guard prevents new jobs; the worker guard closes (a) the in-process-reprocess loop and (b) the flag-set-but-session-alive gap where `StopAssistant` set `blockedAgent=true` but no session existed to delete at block time — today nothing in V2 checks the flag on the next inbound.

**Tech Stack:** Node.js, Express (chatfunnel-api), TypeScript (the `agents-v2/` subtree compiles to `dist/`), Prisma, Jest + jest-mock-extended.

## Global Constraints

- Repo: `chatfunnel-api/` — pure JavaScript repo, EXCEPT the `agents-v2/` subtree which is TypeScript compiled to `dist/` (`HandlerAgent.ts`, `structuredResponse.ts`, etc.). New runtime code in this task goes in `agents-v2/` and is therefore `.ts`. Do NOT create `.ts` files anywhere else in this repo.
- The block query is keyed by `contactId` + `channelId` (the natural key of `contactsChannels`), mirroring the legacy read at `HandlerAssistant.js:1071-1076` and `:1645-1650`.
- This task only READS an existing flag and does not add new queries beyond the `contactsChannels` lookup that the legacy code already performs the same way.
- NEVER connect to or run anything against a real database — all tests mock `@database` (jest auto-mock from `jest.setup.js`), exactly like `__tests__/handleServedByAgentV2.test.js`.
- NEVER run production builds (`npm run build*`). Running `npm test` is allowed; its `pretest` hook runs `tsc -p tsconfig.build.json` to emit `dist/`, which is required for the `@root/dist/...` test imports.

---

## Context: how the legacy block works (reference, do not modify)

- Flag lives in `contactsChannels.blockedAgent` (+ `blockedAgentAt/By/ById/ByName`), keyed by `contactId` + `channelId`.
- Written by: `commands/assistant/StopAssistant.js:87-101` (manual "block", `blockedAgentBy:"HUMAN"`) and `HandlerIGAutomation.js:2123`/`:2181` (automation `BLOCK_ASSISTANT` step).
- Read (the gate) ONLY by legacy `HandlerAssistant.js`:
  - `executeTrigger()` — `:1071-1081`
  - `execute()` — `:1645-1655`
  - Both do: `findFirst({ where:{contactId, channelId} })` → `if (contactChannels?.blockedAgent) { addGptLog("Agent blocked"); return null; }`
- Cleared by: `commands/assistant/UnblockAssistant.js:59-71` (already handles V2 too — no change needed).

The live Agent V2 inbound path is `processorJob.js:102` → `handleActiveAgentSession.js` → `createHandlerAgent()` → `HandlerAgent.execute()`. The account-level `isBlocked` in `processorJob.js:46` is `isAccountBlocked` (whole-account suspension), unrelated to the per-contact `blockedAgent`.

## File Structure

- **Create** `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/agentBlockGuard.ts` — one responsibility: given a contact+channel, answer "is this contact's agent blocked?". Standalone (depends only on `@database`), so it is trivially unit-testable in isolation — same pattern as the existing `structuredResponse.ts`/`splitMessage.ts` helpers.
- **Create** `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/agentBlockGuard.test.js` — unit tests for the guard function.
- **Modify** `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/HandlerAgent.ts` — import the guard and call it at the top of `execute()` (line ~358) and `resumeLoop()` (line ~1602).
- **Modify** `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/queue/AgentSessionWorker.ts` — import the guard (`../agentBlockGuard`) and enforce it at three points inside `processSessionJob`: (a) at the top of each processing-loop iteration, before lifecycle automations / reference files / MCP tools / the LLM call; (b) inside the `tool_use` branch, before `executeToolLoop`, so tools with side-effects don't run for a contact blocked during `callLLM`; (c) folded into the existing post-LLM session-existence guard (`:300`) so the response is discarded before persist/send when the contact was blocked mid-run.

## Out of scope (flagged follow-ups, do NOT implement here)

- `processor/handleServedByAgentV2.js` — an alternate V2 path that POSTs to the NestJS `/agents-v2/execute` endpoint. It is NOT wired into `processorJob.js` (only referenced by its own test), so it is not a live inbound path today. If it ever gets wired, its NestJS executor (`chatfunnel-services/src/modules/agents-v2/agents-v2.controller.ts` `@Post()`/execute) needs the same guard. Note this in the PR description; do not build it now (YAGNI).
- `HandlerAgent.executeTrigger()` (`:1790`) — currently a stub (`"[stub] not yet implemented"`), so it cannot run an agent. Do NOT add a guard to it now; add the guard when the stub is implemented. Note it in the PR description.

---

### Task 1: Reusable `isContactAgentBlocked` guard function

**Files:**
- Create: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/agentBlockGuard.ts`
- Test: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/agentBlockGuard.test.js`

**Interfaces:**
- Consumes: `@database` (Prisma client) — `prisma.contactsChannels.findFirst`.
- Produces: `export async function isContactAgentBlocked(contactId: string | undefined, channelId: string | undefined): Promise<boolean>` — returns `true` only when a `contactsChannels` row exists for the pair and its `blockedAgent === true`; returns `false` when either id is missing or no row/flag. Task 2 imports this exact signature.

- [ ] **Step 1: Write the failing test**

Create `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/agentBlockGuard.test.js`:

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
Expected: FAIL — `Cannot find module '@root/dist/processor/agents-v2/agentBlockGuard'` (the source file does not exist yet, so `pretest`'s `tsc` emits nothing for it).

- [ ] **Step 3: Write minimal implementation**

Create `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/agentBlockGuard.ts`:

```ts
import prisma = require("@database");

/**
 * True when this contact's agent is blocked (the "Encerrar e bloquear IA"
 * action, or a BLOCK_ASSISTANT automation step, set contactsChannels.blockedAgent).
 * Mirrors the legacy gate in HandlerAssistant.execute()/executeTrigger() so the
 * V2 runtime honors the same block. Missing ids => not blocked (cannot identify).
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
Expected: PASS — 5 passing tests. (`pretest` compiles `agentBlockGuard.ts` to `dist/processor/agents-v2/agentBlockGuard.js`.)

---

### Task 2: Enforce the guard in `HandlerAgent.execute()` and `resumeLoop()`

**Files:**
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/HandlerAgent.ts` (import near line 1; guard in `execute()` at ~line 358; guard in `resumeLoop()` at ~line 1602)

**Interfaces:**
- Consumes: `isContactAgentBlocked(contactId, channelId)` from Task 1 (`./agentBlockGuard`); `this.context.contact?.id`, `this.context.channel?.id` (already used throughout `HandlerAgent`, e.g. `:491-492`); `this.addLog(tag, info)` (`:175`).
- Produces: no new exports. Behavior change only — both methods early-`return` (they are `Promise<void>`) before loading the agent / touching the session when the contact is blocked.

- [ ] **Step 1: Add the import**

In `HandlerAgent.ts`, immediately after the existing `import prisma = require("@database");` (line 1), add:

```ts
import { isContactAgentBlocked } from "./agentBlockGuard";
```

- [ ] **Step 2: Guard `execute()`**

In `HandlerAgent.ts`, `execute()` currently starts (lines 358-362):

```ts
    const { agentId, fromBroadcast, broadcastMessageId, existingSession } =
      options;

    const agent = await this.loadAgent(agentId);
    if (!agent) return;
```

Change it to insert the guard between the destructure and `loadAgent` (so a blocked contact never loads the agent or creates a session):

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

In `HandlerAgent.ts`, `resumeLoop()` currently starts (lines 1602-1608):

```ts
  async resumeLoop(sessionId: string): Promise<void> {
    const session = await sessionsRepo.findById(sessionId);
    if (!session) {
      this.addLog("resumeLoop", `session not found session=${sessionId}`);
      return;
    }
    this.session = session;
```

Change it to insert the guard as the first statement:

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
Expected: PASS — no TypeScript errors from `pretest` (`tsc`), and the existing `agents-v2` suite (`splitMessage`, `structuredResponse`, `agentBlockGuard`) all pass. A TS error such as `Cannot find module './agentBlockGuard'` or a type mismatch means the import/edit is wrong; fix before continuing.

---

### Task 3: Enforce the guard inside `AgentSessionWorker` (the running LLM loop)

**Why this task exists:** `execute()`/`resumeLoop()` only enqueue a BullMQ job — the `AgentSessionWorker` is what calls the LLM, runs tools, persists and sends. Its in-process reprocess loop (`AgentSessionWorker.ts:336-347`) re-consumes buffered messages without re-entering `execute()`, so the Task 2 guards do NOT stop a worker that is already running. This task makes `blockedAgent` authoritative in the worker itself.

**Test coverage decision:** the risky *logic* — `isContactAgentBlocked` (missing id → false, row/flag → bool) — is fully unit-tested in Task 1. The worker change is wiring (call the predicate, `break`) whose placement is checked by `tsc` at `pretest`, and whose behavior is covered by the race-case manual verification below. There is no existing `AgentSessionWorker` test harness (only pure-function tests: `splitMessage`, `structuredResponse`), and `processSessionJob` is not exported; a behavioral worker test would require exporting it and mocking the full loop (agent/session repos, provider handler, redis lock/debounce/buffer, loop detector). Per YAGNI that heavyweight harness is deferred — build it only if the worker gains more branching logic worth isolating. If desired, the minimal version is: export `processSessionJob`, `jest.mock` the providers + `../agentBlockGuard`, and assert `handler.sendResponseToContact` is NOT called when `isContactAgentBlocked` resolves `true`.

**Files:**
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/queue/AgentSessionWorker.ts` (import near line 18; resolve ids in the destructure at line 63; guard at the top of the loop ~line 152; fold the block check into the post-LLM guard at ~line 300)

**Interfaces:**
- Consumes: `isContactAgentBlocked(contactId, channelId)` from Task 1 (`../agentBlockGuard`); `job.data.contactId` and `job.data.channelId` (both typed non-optional `string` on `ProcessSessionJobData`, `AgentSessionQueue.ts:14-15` — no `contextSnapshot` fallback needed); `alog(...)` (`:71`).
- Produces: no new exports. Behavior change only — the loop `break`s (never `return`s, so the `finally` at `:353` still releases the session lock) when the contact is blocked.

- [ ] **Step 1: Add the import**

In `AgentSessionWorker.ts`, after the `AgentSessionQueue` import block (near line 18), add:

```ts
import { isContactAgentBlocked } from "../agentBlockGuard";
```

- [ ] **Step 2: Expose contactId/channelId from the job payload**

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

- [ ] **Step 3: Guard the top of the processing loop (before automations / LLM)**

Inside the `while (true)` loop, after the buffer is consumed + messages persisted and BEFORE the lifecycle automations, insert the guard. It currently reads (lines 237-244):

```ts
      // Fire lifecycle automations after persist, before LLM call
      if (isFirstInteraction) {
        await handler.handleLifecycleAutomations("firstInteraction");
      }
      await handler.handleLifecycleAutomations("everyMessage");

      await handler.prepareReferenceFiles();
      await handler.prepareMcpTools();
```

Change it to gate everything from automations onward:

```ts
      if (await isContactAgentBlocked(contactId, channelId)) {
        alog(
          "info",
          `[AgentSessionWorker] agent blocked, skipping before automations/LLM — sessionId=${sessionId}`,
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

This runs on every iteration (including reprocess loops), so it stops LLM cost, tool side-effects and automations for a contact blocked mid-conversation.

- [ ] **Step 4: Re-check the block after `callLLM`, before running tools**

A block can land *during* `callLLM` (30–90 s). If the model returned a `tool_use`, `executeToolLoop` would run tools (kanban moves, tag changes, etc.) with real side-effects before the post-LLM guard in Step 5 sees the block. Add the check inside the existing `tool_use` branch — scoped there deliberately: on the text-response path (no tools) Step 5's guard already gates persist/send, so no extra read is paid on the common path.

The branch currently reads (lines 281-289):

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

Change it to:

```ts
      // Run the tool call → execute → call cycle if the model requested tool use.
      // Re-check the block first: a block that landed during callLLM must not let
      // tools (kanban moves, tags, etc.) run for a now-blocked contact.
      if (response.finishReason === "tool_use") {
        if (await isContactAgentBlocked(contactId, channelId)) {
          alog(
            "info",
            `[AgentSessionWorker] agent blocked after LLM call, skipping tools — sessionId=${sessionId}`,
          );
          break;
        }
        response = await handler.executeToolLoop(
          session,
          llmMessages,
          options,
          response,
        );
      }
```

Resulting order for the tool path: `top-of-loop guard → callLLM → guard → executeToolLoop → combined guard → persist/send`.

- [ ] **Step 5: Fold the block check into the post-LLM guard**

The worker already discards the response if the session was terminated during `callLLM` (lines 300-306):

```ts
      if (!(await sessionsRepo.findById(sessionId))) {
        alog(
          "info",
          `[AgentSessionWorker] session terminated during processing, discarding — sessionId=${sessionId}`,
        );
        break;
      }
```

Replace it with a combined check so a block that lands during `callLLM` also discards the response (not only a session deletion):

```ts
      const [activeSession, agentBlocked] = await Promise.all([
        sessionsRepo.findById(sessionId),
        isContactAgentBlocked(contactId, channelId),
      ]);
      if (!activeSession || agentBlocked) {
        alog(
          "info",
          `[AgentSessionWorker] response discarded — sessionId=${sessionId} reason=${
            agentBlocked ? "agent-blocked" : "session-terminated"
          }`,
        );
        break;
      }
```

- [ ] **Step 6: Verify TypeScript compiles and existing agents-v2 tests stay green**

Run: `cd chatfunnel-api && npm test -- agents-v2`
Expected: PASS — no TypeScript errors from `pretest` (`tsc`), and the existing `agents-v2` suite stays green. A TS error such as `Cannot find module '../agentBlockGuard'` means the import path is wrong (the worker is one directory deeper than `HandlerAgent.ts`, hence `../` not `./`); fix before continuing.

---

## Self-Review

**1. Spec coverage** — the request was "implementar o blockAgent para o Agent V2":
- Guard reads the same flag the legacy uses ✓ (Task 1)
- Guard stops a blocked contact from scheduling a new job on the inbound path `execute()` ✓ (Task 2, Step 2) and the loop-resume path `resumeLoop()` ✓ (Task 2, Step 3)
- Guard enforced inside the running `AgentSessionWorker` at three points — before automations/LLM, before `executeToolLoop` (no tool side-effects for a contact blocked during `callLLM`), and post-LLM before persist/send — closing the in-process reprocess loop and the flag-set-but-session-alive gap that `execute()`/`resumeLoop()` alone cannot cover ✓ (Task 3)
- Unblock path — already handled by `UnblockAssistant.js`, no change needed ✓ (noted in Context)
- Non-live paths (`handleServedByAgentV2` → NestJS, `executeTrigger` stub) — explicitly deferred with rationale ✓ (Out of scope)

**2. Placeholder scan** — every step contains full file contents / exact edits / exact commands with expected output. No TBD/TODO/"handle edge cases". ✓

**3. Type consistency** — `isContactAgentBlocked(contactId, channelId): Promise<boolean>` defined in Task 1 is called with exactly `(this.context.contact?.id, this.context.channel?.id)` in Task 2 (`string | undefined`, matching `ProcessorContext.contact?.id`) and with `(job.data.contactId, job.data.channelId)` in Task 3 (`string`, `ProcessSessionJobData` fields) — both assignable to the `string | undefined` params. The `select: { blockedAgent: true }` shape in the impl matches the `toHaveBeenCalledWith` assertion in the test. ✓

## Manual verification (optional, after merge — user runs the app)

1. Open a livechat with a contact served by a V2 agent; click "Encerrar e bloquear IA".
2. Send a new inbound message from that contact → the V2 agent must NOT respond; agent log shows `execute ... agent blocked for contact, skipping`.
3. Race case (worker already running): send a message, and while the agent is "typing"/processing click "Encerrar e bloquear IA" → no assistant message is persisted or sent; log shows `[AgentSessionWorker] response discarded ... reason=agent-blocked` (or `... skipping tools` if the model had requested a tool). No kanban move / tag change from that turn's tools takes effect.
4. Click "Retomar"/unblock (or `POST /accounts/unblock_assistant/...`) → a new inbound message is answered by the agent again.
