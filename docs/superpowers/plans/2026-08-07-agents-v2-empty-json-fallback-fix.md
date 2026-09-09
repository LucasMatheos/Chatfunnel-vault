# Agents V2 — Empty JSON Envelope Fallback Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the Agents V2 JSON structured-response pipeline from sending the raw `{"messages":[]}` payload as a literal text message to the contact when the LLM legitimately returns an empty envelope.

**Architecture:** `structuredResponse.ts#parseStructuredResponse()` already distinguishes "structurally empty envelope" (`{"messages":[]}` → valid, zero items) from "unparseable/invalid envelope" (→ `null`) — that fix landed directly in the working tree. What remains is the caller, `HandlerAgent.ts#sendResponseToContact()`, which currently only skips the plain-text fallback when `structured?.messages?.length` is truthy — collapsing "valid empty" and "invalid" back into one branch. Fix the caller to branch on "was this a valid envelope at all" (`structured !== null`) rather than "did it have items."

**Tech Stack:** TypeScript, Jest (existing `structuredResponse.test.js` pure-function test file; compiled via `tsc -p tsconfig.build.json` per the repo's `pretest` script before Jest runs).

## Global Constraints

- Repo is `chatfunnel-api` — see its `CLAUDE.md`: the `agents-v2/` subtree is TypeScript, compiled to `dist/` before tests run; this is pre-existing, not something this plan introduces.
- Do not run `npm run build` / `build:processor` manually outside of what `npm test`'s own `pretest` hook triggers — running the test suite is the explicit action requested by this plan; the build-on-test is the repo's existing, pre-configured behavior, not a new build we're choosing to run.
- No commits unless the user explicitly asks — stop after verification and report status.
- Root-cause fix only: no refactors, no touching unrelated branches of `sendResponseToContact` or `dispatchStructuredResponse`.
- Match existing test conventions in this module: only the pure `structuredResponse.ts` functions get unit tests (see existing `structuredResponse.test.js`). `HandlerAgent.ts` has zero existing unit tests in the repo (confirmed via glob of `agents-v2/**/*.test.*`) because it requires Prisma/Redis/S3/ffmpeg/ElevenLabs/queue construction — this plan does **not** introduce a new test harness for that class; the `sendResponseToContact` fix is verified by code review + `tsc` type-checking, consistent with how the rest of that file is already covered (or not) today.

---

### Task 1: Regression test for the empty-envelope parser fix

**Files:**
- Modify (test only): `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/structuredResponse.test.js`
- No source change — `structuredResponse.ts#parseStructuredResponse()` already contains the fix:
  ```ts
  // rawItems was non-empty but every item failed normalization → treat as an
  // unusable/invalid envelope (caller falls back to plain text). rawItems was
  // already empty → this is a valid envelope meaning "send nothing".
  if (messages.length === 0 && rawItems.length > 0) return null;
  return { messages };
  ```

**Interfaces:**
- Consumes: `parseStructuredResponse(content: string): StructuredResponse | null` where `StructuredResponse = { messages: StructuredItem[] }` (from `structuredResponse.ts`, already exported, unchanged signature).
- Produces: nothing new — this is a test-only task confirming existing behavior so it can't silently regress.

- [ ] **Step 1: Add the regression tests**

Insert into `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/structuredResponse.test.js`, inside the existing `describe("parseStructuredResponse", ...)` block, right after the `"returns null when no valid items remain"` test (currently ends at line 69):

```js
  test("returns a valid empty envelope for { messages: [] } — must NOT be treated as invalid", () => {
    const raw = JSON.stringify({ messages: [] });
    const result = parseStructuredResponse(raw);
    expect(result).not.toBeNull();
    expect(result.messages).toEqual([]);
  });

  test("returns a valid empty envelope for a bare empty array []", () => {
    const result = parseStructuredResponse("[]");
    expect(result).not.toBeNull();
    expect(result.messages).toEqual([]);
  });
```

- [ ] **Step 2: Run the test file**

Run (from `chatfunnel-api/`): `npm test -- structuredResponse.test.js`

Expected: all tests in the file PASS, including the two new ones. (They should already pass since the source fix is in place — this step exists to catch a mismatch between the fix and the test's expectations, not to drive new implementation.)

---

### Task 2: Fix `sendResponseToContact` to not fall back to text on a valid-but-empty envelope

**Files:**
- Modify: `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/HandlerAgent.ts:848-879` (method `sendResponseToContact`)

**Interfaces:**
- Consumes: `parseStructuredResponse` (from Task 1's file, signature unchanged: `(content: string) => StructuredResponse | null`), `this.dispatchStructuredResponse(items: StructuredItem[]): Promise<void>` (existing private method, unchanged), `this.sendTextChunks(message: string): Promise<void>` (existing private method, unchanged).
- Produces: `sendResponseToContact(message: string): Promise<void>` — same public signature, only internal branching changes. Called by `AgentSessionWorker.ts:321,374,489` — none of those call sites need changes (verified below).

- [ ] **Step 1: Apply the fix**

Replace in `HandlerAgent.ts` (current lines ~862-876):

```ts
    if (this.agent?.responseFormat === "JSON") {
      const structured = parseStructuredResponse(message);
      if (structured?.messages?.length) {
        this.addLog(
          "sendResponseToContact",
          `PARSED structured envelope: ${structured.messages.length} item(s) types=[${structured.messages.map((m) => m.type).join(",")}] :: ${this.preview(structured.messages)}`,
        );
        await this.dispatchStructuredResponse(structured.messages);
        return;
      }
      this.addLog(
        "sendResponseToContact",
        "responseFormat=JSON but parse failed; falling back to plain text",
      );
    }
```

with:

```ts
    // Structured (rich) response path — only when the agent is configured for
    // JSON output. A valid envelope with zero items means "send nothing" and
    // must NOT fall back to dumping the raw JSON as text. Only an unparseable
    // / invalid envelope (structured === null) falls back to plain text.
    if (this.agent?.responseFormat === "JSON") {
      const structured = parseStructuredResponse(message);
      if (structured) {
        if (structured.messages.length) {
          this.addLog(
            "sendResponseToContact",
            `PARSED structured envelope: ${structured.messages.length} item(s) types=[${structured.messages.map((m) => m.type).join(",")}] :: ${this.preview(structured.messages)}`,
          );
          await this.dispatchStructuredResponse(structured.messages);
        } else {
          this.addLog(
            "sendResponseToContact",
            "PARSED structured envelope with empty messages array; nothing to send",
          );
        }
        return;
      }
      this.addLog(
        "sendResponseToContact",
        "responseFormat=JSON but parse failed; falling back to plain text",
      );
    }
```

- [ ] **Step 2: Type-check**

Run (from `chatfunnel-api/`): `npx tsc -p tsconfig.build.json --noEmit`

Expected: no new errors introduced in `HandlerAgent.ts` (the `structured` variable is now narrowed by `if (structured)` before `.messages` is accessed in either branch — `StructuredResponse | null` narrows to `StructuredResponse` inside the block, so this must type-check cleanly).

- [ ] **Step 3: Manually re-verify the other two `sendResponseToContact` call sites are unaffected**

Re-check `chatfunnel-api/src/commands/instagram/WebHookHandler/processor/agents-v2/queue/AgentSessionWorker.ts:321` and `:489` — both pass `agent.errorMessage` (a plain configured string, never agent-generated JSON). For an agent with `responseFormat === "JSON"`, `parseStructuredResponse(agent.errorMessage)` will fail `JSON.parse` (plain prose is not valid JSON) and correctly return `null`, so these calls keep hitting the plain-text fallback exactly as before. No code change needed here — this step is a confirmation, not a diff.

---

### Task 3: Full module verification

**Files:** none (verification only)

**Interfaces:** none — this task only runs existing test/type-check tooling across the touched module.

- [ ] **Step 1: Run the full `agents-v2` Jest test files**

Run (from `chatfunnel-api/`):
```bash
npm test -- structuredResponse.test.js splitMessage.test.js agentBlockGuard.test.js antiPromptLeak.test.js
```
Expected: all PASS, no regressions in sibling files touched by the same `pretest` TS build.

- [ ] **Step 2: Confirm no other callers of `parseStructuredResponse` exist**

Run: `git grep -n "parseStructuredResponse" -- chatfunnel-api/src`

Expected output: exactly two matches — the definition in `structuredResponse.ts` and the single call site in `HandlerAgent.ts` (already fixed in Task 2). If a new call site has appeared since this plan was written, stop and re-scope Task 2 to cover it before proceeding.

- [ ] **Step 3: Report status to the user**

Summarize: parser fix confirmed + regression-tested (Task 1), caller fix applied + type-checked (Task 2), no other call sites affected (Task 3). Do not commit or push anything beyond what the user explicitly requested.

---

## Self-Review Notes

- **Spec coverage:** User's 3 cases — (1) `messages: []` → no send: Task 2's `else` branch (log + `return`, no `sendTextChunks` call). (2) valid envelope with items → dispatch normally: unchanged existing branch. (3) invalid JSON / plain text → fallback to text: unchanged `structured === null` branch. All three covered.
- **Placeholder scan:** none found — every step has literal code/commands.
- **Type consistency:** `StructuredResponse`, `StructuredItem`, `parseStructuredResponse` signatures are identical across Task 1 and Task 2 (both reference the same unmodified exports from `structuredResponse.ts`); `sendResponseToContact(message: string): Promise<void>` signature unchanged, matching all 3 existing call sites in `AgentSessionWorker.ts`.
