# Broadcast Dispatch Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every immediate broadcast traceable from scheduling through dispatch, enqueueing, sending, and batch persistence, so a zero-send campaign has a concrete failure stage and reason.

**Architecture:** Keep the current asynchronous pipeline intact: `chatfunnel-api` creates the campaign, `@chatfunnel/core` schedules it, `chatfunnel-scheduler` dispatches it, and `chatfunnel-worker-broadcast` enqueues and sends individual messages. Add compact, structured stage logs keyed by `broadcastId` and `jobId`; remove the scheduler's full-context log because it leaks contact data and channel credentials while obscuring the useful event.

**Tech Stack:** Node.js, Express, TypeScript, JavaScript, BullMQ, Axios, Pino, Redis, Prisma.

**Spec:** `debugging/logs/logs broadcasts.txt`, `vault/wiki/repos/chatfunnel-scheduler.md`, `vault/wiki/repos/chatfunnel-worker-broadcast.md`.

## Global Constraints

- Do not access the production database, Redis, or environment credentials directly.
- Do not log phone numbers, contact names, message content, access tokens, full HTTP payloads, or complete Axios errors.
- Use `broadcastId`, scheduler `jobId`, `queueName`, `channelId`, counts, HTTP status, and sanitized error code/message for correlation.
- Preserve the existing queue payload and dispatch endpoints; this plan adds observability only and does not change delivery semantics.
- Keep account scoping on all existing queries; do not introduce hard deletes or migrations.
- Do not add a test framework: `chatfunnel-scheduler` and `chatfunnel-worker-broadcast` currently have no automated test setup.
- Do not run production builds, migrations, database operations, commits, or pushes as part of this work.

---

## File Structure

| Repository | File | Responsibility after change |
|---|---|---|
| `chatfunnel-core` | `src/queues/base.queue.ts` | Emit a safe scheduling acknowledgement/failure record without dumping queue context. |
| `chatfunnel-api` | `src/commands/accounts/CreateBroadcast/handler.js` | Log that the API requested an immediate/scheduled broadcast job and whether the scheduler acknowledged it. |
| `chatfunnel-scheduler` | `src/queues/BaseQueue.ts` | Trace queue acceptance, processing, dispatch request, dispatch response, and retryable dispatch failure. |
| `chatfunnel-scheduler` | `src/services/WorkerService.ts` | Return/propagate the broadcast dispatcher response with its HTTP status while preserving existing routing. |
| `chatfunnel-worker-broadcast` | `src/controllers/broadcast.controller.ts` | Record receipt and outcome of `/broadcasts/dispatch`. |
| `chatfunnel-worker-broadcast` | `src/services/broadcast.service.ts` | Record broadcast lookup, template lookup, pending-contact count, batch enqueue totals, and terminal enqueue outcome. |
| `chatfunnel-worker-broadcast` | `src/queues/processors/sendMessage.processor.ts` | Keep only actionable per-message failures; remove PII from send/rate-limit logs and add `broadcastId` to failure records. |
| `chatfunnel-worker-broadcast` | `src/queues/processors/databaseBatch.processor.ts` | Emit per-broadcast persistence summaries and completion/failure records. |
| `vault/wiki/repos/chatfunnel-scheduler.md` | Documentation | Document the correlation fields and safe collection procedure. |
| `vault/wiki/repos/chatfunnel-worker-broadcast.md` | Documentation | Document the dispatch-stage events and the no-PII logging rule. |

## Event Contract

All new broadcast events must use a stable `event` value and the following shared fields where available:

```ts
type BroadcastTraceLog = {
  event:
    | "broadcast.schedule.requested"
    | "broadcast.schedule.accepted"
    | "broadcast.schedule.failed"
    | "broadcast.scheduler.processing"
    | "broadcast.scheduler.dispatch_succeeded"
    | "broadcast.scheduler.dispatch_failed"
    | "broadcast.dispatch.received"
    | "broadcast.template.lookup_failed"
    | "broadcast.contacts.enqueued"
    | "broadcast.send.failed"
    | "broadcast.batch.persisted"
    | "broadcast.batch.failed"
    | "broadcast.finished";
  broadcastId: string;
  jobId?: string;
  queueName?: "broadcastQueue" | "broadcast-send" | "database-batch-writer-queue";
  channelId?: string;
  accountId?: string;
  scheduledDelayMs?: number;
  batchSize?: number;
  enqueuedCount?: number;
  persistedCount?: number;
  successCount?: number;
  errorCount?: number;
  httpStatus?: number;
  errorCode?: string;
  errorMessage?: string;
};
```

`errorMessage` must be a bounded, sanitized operational description (for example, Meta error title/code or HTTP status text), never a serialized request/response object.

### Task 1: Record creation-to-scheduler acknowledgement

**Files:**
- Modify: `chatfunnel-core/src/queues/base.queue.ts:30-100`
- Modify: `chatfunnel-api/src/commands/accounts/CreateBroadcast/handler.js:313-350`

**Interfaces:**
- Consumes: `BroadcastQueue.addJob({ broadcastId, account, channel }, delay)`.
- Produces: `broadcast.schedule.requested`, `broadcast.schedule.accepted`, or `broadcast.schedule.failed` with the campaign ID and scheduler job ID when available.

- [ ] **Step 1: Define the safe schedule log fields at the call site**

In `CreateBroadcast/handler.js`, derive only the non-sensitive values needed for the trace before calling the queue:

```js
const scheduleTrace = {
  event: "broadcast.schedule.requested",
  broadcastId,
  accountId: account.id,
  channelId: channel.id,
  scheduleType: data.scheduleType,
  scheduledDelayMs: getDelay(),
  contactCount: contacts.length,
};
Logger.info(scheduleTrace);
```

Compute the delay once and pass that same value to `broadcastQueue.addJob`; do not call `getDelay()` a second time and create an inconsistent trace.

- [ ] **Step 2: Log scheduler acknowledgement without queue context**

Capture the return from `broadcastQueue.addJob` and emit either an accepted or failed event. The log must not serialize `account`, `channel`, or contacts:

```js
const scheduledJob = await broadcastQueue.addJob(queueContext, delay);

Logger.info({
  event: scheduledJob ? "broadcast.schedule.accepted" : "broadcast.schedule.failed",
  broadcastId,
  jobId: scheduledJob?.id,
  accountId: account.id,
  channelId: channel.id,
  scheduledDelayMs: delay,
});
```

Keep the current HTTP response and persistence behavior unchanged in this observability-only change. A missing acknowledgement is recorded for diagnosis but does not introduce a new broadcast state or migration.

- [ ] **Step 3: Make core queue failures identifiable**

In `BaseQueue.scheduleJob`, keep the existing return contract (`job` or `null`) and change its error output to include the queue name and, when `context.broadcastId` exists, the `broadcastId` and sanitized HTTP/error code:

```ts
console.error({
  event: "broadcast.schedule.failed",
  broadcastId: (context as { broadcastId?: string }).broadcastId,
  queueName: this.queueName,
  errorCode: e?.response?.status?.toString() ?? e?.code,
  errorMessage: e?.response?.statusText ?? e?.message,
});
```

Do not print `e.response.data` because it can contain request context or secrets.

- [ ] **Step 4: Verify with a one-contact immediate broadcast in a non-production-safe test account**

Create one immediate broadcast only after deployment and collect API logs for its `broadcastId`.

Expected sequence within seconds:

```text
broadcast.schedule.requested
broadcast.schedule.accepted
```

Expected failure sequence when the scheduler cannot be reached:

```text
broadcast.schedule.requested
broadcast.schedule.failed
```

### Task 2: Trace the scheduler queue lifecycle and dispatcher response

**Files:**
- Modify: `chatfunnel-scheduler/src/queues/BaseQueue.ts:35-151`
- Modify: `chatfunnel-scheduler/src/services/WorkerService.ts:27-34`
- Modify: `chatfunnel-scheduler/src/routes/scheduler.routes.ts:11-48`

**Interfaces:**
- Consumes: scheduler job context containing `broadcastId`, `account`, and `channel`.
- Produces: scheduler logs with `broadcastId`, `jobId`, `queueName`, dispatch HTTP status, and sanitized error information.

- [ ] **Step 1: Replace the unsafe full payload log**

Replace `console.log(`[JOB:${id}] Executing...`, JSON.stringify(context))` with a conditional, structured log. For `broadcastQueue`, emit only correlation fields:

```ts
if (this.queueName === "broadcastQueue") {
  console.log({
    event: "broadcast.scheduler.processing",
    broadcastId: context.broadcastId,
    jobId: id,
    queueName: this.queueName,
    accountId: context.account?.id,
    channelId: context.channel?.id,
  });
}
```

For non-broadcast queues, retain a compact queue/job log without serializing context.

- [ ] **Step 2: Log schedule acceptance at the scheduler boundary**

After `queues[queueName].addJob(...)` succeeds in `scheduler.routes.ts`, emit an event for `broadcastQueue`:

```ts
console.log({
  event: "broadcast.schedule.accepted",
  broadcastId: context?.broadcastId,
  jobId: job.id,
  queueName,
  scheduledDelayMs: delay ?? 0,
});
```

On route failure, log the same identifiers plus a sanitized error before returning the existing `500` response.

- [ ] **Step 3: Log dispatcher acknowledgement and failure**

Change `WorkerService.send` to return Axios's response. In `executeWorker`, capture it and emit the result for `broadcastQueue`:

```ts
const response = await workerService.send(this.queueName, context);
console.log({
  event: "broadcast.scheduler.dispatch_succeeded",
  broadcastId: context.broadcastId,
  jobId: id,
  queueName: this.queueName,
  httpStatus: response.status,
});
```

Before rethrowing in the existing catch block, log `broadcast.scheduler.dispatch_failed` with `broadcastId`, `jobId`, `queueName`, `error.response?.status`, and `error.code`/`error.message`. Preserve BullMQ retries and the existing unavailable-worker normalization.

- [ ] **Step 4: Verify scheduler states without reading Redis directly**

Use the scheduler's existing HTTP status endpoint in the deployment environment to inspect only queue metadata:

```bash
curl -sS http://scheduler-api:3000/jobs
```

Expected outcome for a successful one-contact dispatch: the trace includes `accepted`, `processing`, and `dispatch_succeeded`; the `broadcastQueue` job moves to completed. For a failing dispatcher, the trace includes `dispatch_failed` and BullMQ retries it according to the existing attempt/backoff settings.

### Task 3: Trace broadcast API validation and contact enqueueing

**Files:**
- Modify: `chatfunnel-worker-broadcast/src/controllers/broadcast.controller.ts:4-18`
- Modify: `chatfunnel-worker-broadcast/src/services/broadcast.service.ts:41-149`

**Interfaces:**
- Consumes: `POST /broadcasts/dispatch` payload with `broadcastId`, `account.id`, and `channel.id`.
- Produces: a `202` response as today plus trace events for receipt, template failure, and each enqueue batch summary.

- [ ] **Step 1: Log receipt before service execution**

Add the first worker-broadcast event before `enqueueBroadcast`:

```ts
logger.info(
  {
    event: "broadcast.dispatch.received",
    broadcastId,
    accountId: account?.id,
    channelId: channel?.id,
  },
  "Broadcast dispatch received",
);
```

Keep the existing `202` success and `400` error response behavior.

- [ ] **Step 2: Turn template lookup failure into an actionable log**

Immediately before throwing when `getTemplateById` returns `status: false`, write a bounded error record:

```ts
logger.error(
  {
    event: "broadcast.template.lookup_failed",
    broadcastId,
    accountId,
    channelId,
    templateMetaId: broadcast.whatsappTemplate?.metaId,
    errorCode: templateMeta.error?.code?.toString(),
    errorMessage: templateMeta.error?.message ?? templateMeta.error?.error_user_title,
  },
  "Broadcast template lookup failed",
);
```

Do not log the channel access token, full Meta response, or template body.

- [ ] **Step 3: Emit batch enqueue summaries, not one log per contact**

Make `processBatch` return the number of jobs successfully added. After each call, log the batch size and cumulative total:

```ts
const enqueuedCount = await this.processBatch(contactIds, broadcast, account, channel);
logger.info(
  {
    event: "broadcast.contacts.enqueued",
    broadcastId,
    channelId,
    batchSize: contactIds.length,
    enqueuedCount,
  },
  "Broadcast contacts enqueued",
);
```

The enqueue loop must keep the existing stable job ID format `b-${broadcast.id},c-${contact.id}` so retries remain idempotent.

- [ ] **Step 4: Verify the API-to-send-queue handoff**

For the controlled one-contact broadcast, collect `broadcast-api` logs filtered by its campaign ID.

Expected sequence:

```text
broadcast.dispatch.received
broadcast.contacts.enqueued { batchSize: 1, enqueuedCount: 1 }
Broadcast enqueued
```

Expected template failure sequence:

```text
broadcast.dispatch.received
broadcast.template.lookup_failed
dispatchBroadcast failed
```

### Task 4: Make sending and batch persistence diagnosable at campaign level

**Files:**
- Modify: `chatfunnel-worker-broadcast/src/queues/processors/sendMessage.processor.ts:70-170`
- Modify: `chatfunnel-worker-broadcast/src/queues/processors/databaseBatch.processor.ts:23-191`

**Interfaces:**
- Consumes: `broadcast-send` jobs with `broadcast.id`, `contact.id`, `channel.id`, and Meta send results.
- Produces: non-PII send failures, batch persistence summaries, and a finished event keyed by `broadcastId`.

- [ ] **Step 1: Remove PII from existing send-worker logs**

Replace every logged `phone` property with `broadcastId` and `contactId`. Keep per-contact logs only for rate limits and failures; avoid an info log for every successful send:

```ts
logger.error(
  {
    event: "broadcast.send.failed",
    broadcastId: broadcast.id,
    contactId: contact.id,
    channelId: channel.id,
    jobId: job.id,
    errorCode: response.error?.code?.toString(),
    errorMessage: response.error?.message ?? response.error?.title,
  },
  "Broadcast message send failed",
);
```

Continue pushing the existing result payload to `db-write-buffer`; this task does not alter retry or persistence behavior.

- [ ] **Step 2: Add batch persistence summaries**

In `databaseBatch.processor.ts`, group the popped buffer items by `broadcastId` before persistence. After a successful transaction, emit one event per broadcast:

```ts
logger.info(
  {
    event: "broadcast.batch.persisted",
    broadcastId,
    persistedCount: broadcastItems.length,
    successCount: broadcastItems.filter((item) => item.status === StatusBroadcastEnum.SUCCESS).length,
    errorCount: broadcastItems.filter((item) => item.status === StatusBroadcastEnum.ERROR).length,
  },
  "Broadcast batch persisted",
);
```

When the existing completion check marks a campaign finished, use `event: "broadcast.finished"`. In the catch block, add `event: "broadcast.batch.failed"` and list only affected broadcast IDs and the sanitized transaction error.

- [ ] **Step 3: Verify end-to-end outcome with one recipient**

Collect the three worker process logs, using only the `broadcastId`:

```bash
CAMPAIGN_ID='<test-broadcast-id>'
for CONTAINER in broadcast-api broadcast-send-worker broadcast-batch-worker; do
  echo "========== $CONTAINER =========="
  docker logs --since '2026-08-27T00:00:00Z' --timestamps "$CONTAINER" 2>&1 |
    grep -iF "$CAMPAIGN_ID" || echo 'Sem ocorrências.'
done
```

Expected success sequence: enqueue summary, optional send failure records only when Meta rejects, batch persistence summary, then `broadcast.finished`. A zero-send campaign must now stop at a named stage rather than silently remaining at `0%`.

### Task 5: Document the diagnostic contract and operational procedure

**Files:**
- Modify: `vault/wiki/repos/chatfunnel-scheduler.md`
- Modify: `vault/wiki/repos/chatfunnel-worker-broadcast.md`

**Interfaces:**
- Consumes: the event contract from this plan.
- Produces: a support-safe runbook for tracing a broadcast by `broadcastId`.

- [ ] **Step 1: Document stage ownership**

Add this exact ownership mapping to the scheduler note:

```text
schedule.requested/accepted/failed  -> API/Core/Scheduler API
scheduler.processing/dispatch_*     -> Scheduler worker
dispatch.received/template.*         -> Broadcast API
contacts.enqueued/send.failed        -> Broadcast API/send worker
batch.persisted/finished             -> Batch worker
```

- [ ] **Step 2: Document the safe collection command and interpretation**

Add the Task 4 collection command and state that `error|fail|exception` must not be used as the primary filter because it mixes unrelated services and JSON payload fields. State that the operator should filter by `broadcastId` first, then inspect the missing next stage.

- [ ] **Step 3: Record the security rule**

Document that broadcast tracing must never include contacts, message bodies, or Meta/WhatsApp access tokens. Reference the prior incident symptom: payload dumps made the relevant campaign events difficult to find and exposed sensitive data.

## Acceptance Criteria

- A campaign ID produces a compact, ordered trace at every stage from API scheduling through batch persistence.
- A scheduler HTTP failure identifies `broadcastId`, queue/job ID, and sanitized error status.
- A Meta template lookup failure identifies the campaign and template metadata ID without exposing credentials or template content.
- A send failure identifies campaign/contact/job IDs and a sanitized Meta error; successful sends do not create one noisy info log per contact.
- Batch logs report persisted, successful, and failed counts per campaign and announce campaign completion.
- Scheduler no longer serializes full queue context to standard output.
- The vault runbook tells support how to determine the first missing stage from a single campaign ID.

## Out of Scope

- Changing retries, throughput, batch size, queue retention, or message delivery semantics.
- Adding a campaign status/error schema, migration, or UI status screen.
- Retrospectively determining the exact failure of campaign `ee9f1394-a91b-4eab-9e22-12c7009e9b86`; current logs lack the correlation events this plan introduces.
- Identifying the authenticated user who manually cancelled the campaign; that requires a separate audit-trail feature.
