# Structured Logger Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `chatfunnel-services` a reusable way to get a Grafana-visible structured logger for any module, instead of hand-declaring `createLogger({...})` per file. First consumer is the partner-transaction resilience fix (`docs/superpowers/plans/2026-08-28-partner-transaction-resilience.md`), which depends on this plan being done first.

**Architecture:** One root Winston logger (`Console` transport, JSON format, timestamp, `service: "nest"`) lives in a single new helper file. `createStructuredLogger(context, metadata?)` returns `rootLogger.child({ context, ...metadata })` — Winston's built-in mechanism for a derived logger that tags every entry with extra metadata while reusing the parent's transports. This guarantees exactly one `Console` transport for the whole app no matter how many modules call it. It reaches Grafana via stdout → `json-file` docker driver → VM collector → Loki → Grafana (confirmed pipeline for the `nest` container). It does not touch the existing `LoggerHelper` (`src/core/helpers/logger.helpers.ts`) — that one writes to files inside the container only, used elsewhere for account-scoped file logs, and is out of scope here.

**Tech Stack:** Winston (already a `chatfunnel-services` dependency).

## Global Constraints

- Repo: `chatfunnel-services`. Double quotes, semicolons (Prettier).
- Do not run `npm run build` — only `npm test`. Do not commit — leave changes staged after each step.
- All commands below assume the working directory is `chatfunnel-services/`.

---

## File Structure

| File | Change |
|---|---|
| `src/core/helpers/structured-logger.helper.ts` | New — one root Winston logger + `createStructuredLogger(context, metadata?)` factory using `.child()`. |
| `src/core/helpers/structured-logger.helper.spec.ts` | New — 1 test confirming context/metadata are merged into `defaultMeta`. |

---

### Task 1: Shared structured logger factory

**Files:**
- Create: `src/core/helpers/structured-logger.helper.ts`
- Test: `src/core/helpers/structured-logger.helper.spec.ts`

**Interfaces:**
- Produces: `createStructuredLogger(context: string, metadata?: Record<string, unknown>): Logger` — a Winston child logger sharing one module-level root `Console`+JSON logger (`service: "nest"`), tagged with `context` (and any extra `metadata`) on every entry.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/helpers/structured-logger.helper.spec.ts
import { createStructuredLogger } from "./structured-logger.helper";

describe("createStructuredLogger", () => {
  it("tags every log entry with service and context (plus any extra metadata)", () => {
    const logger = createStructuredLogger("TestContext", { extra: "value" });

    expect(logger.defaultMeta).toMatchObject({
      service: "nest",
      context: "TestContext",
      extra: "value",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- structured-logger.helper.spec.ts` — expect FAIL (`Cannot find module './structured-logger.helper'`).

- [ ] **Step 3: Write the implementation**

```ts
// src/core/helpers/structured-logger.helper.ts
import { createLogger, transports, format, Logger } from "winston";

const rootLogger: Logger = createLogger({
  format: format.combine(format.timestamp(), format.json()),
  defaultMeta: { service: "nest" },
  transports: [new transports.Console()],
});

export function createStructuredLogger(
  context: string,
  metadata: Record<string, unknown> = {},
): Logger {
  return rootLogger.child({ context, ...metadata });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- structured-logger.helper.spec.ts` — expect PASS.

- [ ] **Step 5: Compile check**

Run: `npx tsc --noEmit -p tsconfig.json` — expect no new errors.

- [ ] **Step 6: Stage**

```bash
git add src/core/helpers/structured-logger.helper.ts src/core/helpers/structured-logger.helper.spec.ts
```

---

## Out of scope

Retrofitting `createStructuredLogger` into any existing module's current `console.*`/`LoggerHelper` usage — this plan only creates the factory. Adopting it elsewhere (starting with the partner-transaction webhook, in its own plan) is a separate decision per consumer.

---

## Self-Review

**Spec coverage:** single shared `Console` transport via Winston's own `.child()`, reusable per-context factory → Task 1, only task.

**Placeholder scan:** clean, complete code in the one step that needs it.

**Type consistency:** `createStructuredLogger`'s return type (`Logger`, via `.child()`) is what any consumer (e.g. the partner-transaction plan) expects — a normal Winston `Logger` with `.info`/`.warn`/`.error`.
