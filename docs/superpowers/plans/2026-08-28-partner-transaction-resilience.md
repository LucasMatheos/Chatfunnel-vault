# Partner Transaction Failure Visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status: implemented.** This document now describes what was actually built, kept in sync after the fact. The 10s account-lookup retry originally planned here was deliberately dropped by the user during implementation — `handleCreatePartnerTransaction` throws immediately on "account not found" (logged first), same as it always did, just now logged instead of uncaught.

**Prerequisite:** `docs/superpowers/plans/2026-08-28-structured-logger-helper.md` (done) — this plan imports `createStructuredLogger` from `src/core/helpers/structured-logger.helper.ts`.

**Goal:** In `chatfunnel-services`' `handleCreatePartnerTransaction` (Stripe→Partnero commission sync): make every failure a structured, Grafana-queryable Winston log — without changing which failures propagate to Stripe (lookup failures still throw, so Stripe still retries the webhook; the rest still swallow, same as today).

**Architecture:** No queue, no cron, no new database, no new module. Two files changed:
1. `partnersAPI.searchCustomer` (`src/core/apis/partners.api.ts`) stops swallowing every request error into `null` — it now resolves `undefined` only for a genuinely empty search result, and re-throws real errors (matching its three sibling methods in the same file, which already do this).
2. `handleCreatePartnerTransaction` runs its entire body inside one `try/catch`, tracked with a `stage` variable (`findSubscription` / `findAccount` / `searchCustomer` / `createTransaction` / `linkPartner`) so the log says exactly where it failed, and includes `accountId`/`userId`/`amount` whenever `account` was already resolved by that point. The `catch` re-throws only for `stage === "findSubscription" || stage === "findAccount"` — everything else (`searchCustomer`, `createTransaction`, `linkPartner`) logs and swallows, unchanged from before.

Logging: `partnerTransactionLogger = createStructuredLogger("StripeWebhookHandler")` — reaches Grafana via stdout → `json-file` docker driver → VM collector → Loki → Grafana, unlike the existing `LoggerHelper`, which only writes to files inside the container.

**Tech Stack:** Winston (via the prerequisite plan's `createStructuredLogger`).

## Global Constraints

- Repo: `chatfunnel-services`. Double quotes, semicolons (Prettier). Winston only for logging, never `console.*` or `@nestjs/common`'s `Logger`.
- No retry anywhere in this fix — dropped by explicit user decision. No persisted failure table, queue, or endpoint.
- Lookup-stage failures (`findSubscription`, `findAccount`) still propagate out of `handleCreatePartnerTransaction` after being logged — this is what lets Stripe retry the whole webhook.
- Do not run `npm run build` — only `npm test`. Do not commit — leave changes staged.

---

## File Structure

| File | Change |
|---|---|
| `src/core/apis/partners.api.ts` | Modify — `searchCustomer`'s `catch` re-throws instead of swallowing to `null`. |
| `src/modules/stripe/commands/webhook/handler.ts` | Modify — `partnerTransactionLogger = createStructuredLogger("StripeWebhookHandler")`. `handleCreatePartnerTransaction` gains a `stage`-tracked single `try/catch` around the whole method, with a conditional re-throw for lookup-stage failures only. |
| `src/modules/stripe/commands/webhook/handler.spec.ts` | 8 tests (see Task 2). |

---

### Task 1: Fix `searchCustomer` to stop masking real errors as "not found" — done

**Files:** `src/core/apis/partners.api.ts`

`searchCustomer`'s `catch` block (previously `console.error(...); return null;`) now does:

```ts
    try {
      const response = await this.api.get(
        `customers:search?${params.toString()}`,
      );
      return response.data.data[0];
    } catch (error) {
      throw error.response?.data || error;
    }
```

Its only call site in the repo (`handler.ts`) is inside Task 2's `try/catch`. Verified: `npx tsc --noEmit -p tsconfig.json` — no new errors.

---

### Task 2: Stage-tracked logging, preserve the throw on lookup failure — done

**Files:** `src/modules/stripe/commands/webhook/handler.ts`, `src/modules/stripe/commands/webhook/handler.spec.ts`

Actual implementation:

```ts
  private async handleCreatePartnerTransaction(data: StripeObjectData) {
    const { id, customer, amount } = data;
    let stage = "findSubscription";
    let account: Prisma.AccountsGetPayload<{
      include: { Channels: true; user: true };
    }> | null = null;

    try {
      const subscription =
        await this.stripePaymentApi.findSubscriptionByCustomerId(customer);

      stage = "findAccount";
      account = await this.findAccountBySubscription(subscription);

      if (!account) {
        throw new NotFoundException(
          `Account not found for partner transaction (subscription ${subscription?.id})`,
        );
      }

      stage = "searchCustomer";
      const partnerCustomer = await this.partnersAPI.searchCustomer({
        key: account.user.id,
      });
      if (!partnerCustomer) {
        partnerTransactionLogger.warn("Partner customer not found", {
          stage,
          chargeId: id,
          accountId: account.id,
          userId: account.user.id,
        });
        return;
      }

      stage = "createTransaction";
      await this.partnersAPI.createTransaction(
        account.user.id,
        id,
        amount / 100,
      );

      if (!!account.user.partnerId) return;

      stage = "linkPartner";
      const partner = await this.partnersRepository.findByPartnerId(
        partnerCustomer.partner,
      );
      if (!partner) {
        throw new NotFoundException(
          `Partner ${partnerCustomer.partner} not found on database`,
        );
      }
      await this.usersRepository.update(account.user.id, {
        partners: {
          connect: {
            id: partner.id,
          },
        },
      });
    } catch (error) {
      const isError = error instanceof Error;
      partnerTransactionLogger.error("handleCreatePartnerTransaction error", {
        stage,
        chargeId: id,
        customerId: customer,
        accountId: account?.id,
        userId: account?.user?.id,
        amount: amount / 100,
        error: isError ? error.message : error,
        stack: isError ? error.stack : undefined,
      });

      if (stage === "findSubscription" || stage === "findAccount") {
        throw error;
      }
    }
  }
```

8 tests in `handler.spec.ts`, all passing:
1. Happy path — creates the transaction.
2. Account not found — logs and re-throws immediately (no retry).
3. `findSubscriptionByCustomerId` throws — logs (`stage: "findSubscription"`) and re-throws.
4. `findAccountBySubscription` throws — logs (`stage: "findAccount"`) and re-throws, confirmed via `jest.getTimerCount()` that no retry timer is scheduled.
5. `createTransaction` fails — logs with `accountId`/`userId`/`amount` and swallows (`usersRepository.update` never called).
6. `searchCustomer` throws a real error (not "not found") — logs with detail, distinct from the `warn`-level not-found path.
7. `searchCustomer` resolves `undefined` — `warn`s "Partner customer not found," `createTransaction` never called.
8. `linkPartner` (`partnersRepository.findByPartnerId`) throws — logs (`stage: "linkPartner"`) and swallows.

Verified: `npx jest structured-logger.helper.spec.ts webhook/handler.spec.ts` → 10/10 passing (2 from the prerequisite plan's logger spec + these 8).

---

### Task 3: Post-deploy Grafana check (manual, after the user deploys) — not yet run

A **successful** `charge.succeeded` never calls `partnerTransactionLogger` at all (the happy path has no log call) — so waiting for a real payment proves nothing either way. Verify the pipeline directly instead, with a throwaway line that uses the exact same Winston config as the real code, run inside the actual `nest` container so it goes through the real stdout → `json-file` → collector → Loki path:

- [ ] **Step 1:** After deploying, run on the VM:

```bash
docker exec nest node -e "
const { createLogger, transports, format } = require('winston');
const logger = createLogger({
  format: format.combine(format.timestamp(), format.json()),
  defaultMeta: { service: 'nest' },
  transports: [new transports.Console()],
}).child({ context: 'StripeWebhookHandler' });
logger.error('Grafana pipeline smoke test', { chargeId: 'smoke_test_' + Date.now() });
"
```

- [ ] **Step 2:** In Grafana Explore (Loki datasource), run: `{container="nest"} | json | context="StripeWebhookHandler"` over the last 5 minutes. (`| json` is required — `context` lives inside the JSON body, not as a Loki label.)
- [ ] **Step 3:** Confirm the "Grafana pipeline smoke test" line appears with the expected parsed fields (`service`, `context`, `timestamp`, `chargeId` starting with `smoke_test_`). If nothing appears, the gap is in the VM's log collector, not this code — separate investigation.

---

## Out of scope

No retry of any kind (dropped by explicit decision, not just the account-lookup one originally planned) — `createTransaction`/`searchCustomer`/`linkPartner` failures are real API failures, not races, and retrying without an idempotency check risks duplicate transactions; account-lookup retries were dropped too, since Stripe's own webhook retry already covers that race by re-delivering the whole event. No persisted failure table, queue, or manual retry endpoint — Grafana is the access point. No changes to `LoggerHelper` or any other module's logging.

---

## Self-Review

**Spec coverage:** lookup-stage failures logged AND still propagate (preserves Stripe's retry) → Task 2, tests 2-4. Per-stage log granularity → the `stage` variable, tested across all failure cases. `searchCustomer` real-error vs. not-found distinction → Task 1 + Task 2's test 6 vs. 7. `createTransaction`/`searchCustomer`/`linkPartner` failures still swallowed → Task 2, tests 5, 6, 8. Commission-debugging context (`accountId`/`userId`/`amount`) on every error log where `account` was resolved → tested in tests 5, 6, 8. Grafana delivery verification not yet run → Task 3, pending.

**Placeholder scan:** clean — this reflects real, tested, passing code.

**Type consistency:** verified directly against the files on disk, not from memory — `handler.ts`, `handler.spec.ts`, and `partners.api.ts` were re-read in full before writing this revision.
