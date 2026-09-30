---
author: john + capy
feature: error-reporting
date: 2026-09-30
status: draft; unit 1 implemented (uncommitted on errors-core), see units.md
---

# Error reporting: one classifier, one reporter, Sentry as the bug inbox

Units: `units.md`.

## Problem

Sentry is ignored because it's mostly expected errors, and the `#scans` alert says nothing about who was hit.

```
14d of autumn-server Sentry events: 81,357
  expected (4xx we threw on purpose)      ~79%   AUTUMN-SERVER-BM alone: 53,302 (400 "Entity ... not found")
  transient (pg timeout, Tinybird 5xx)    ~10%
  bugs                                     ~3%
```

Leaks, all catch-alls:

```
server   processMessage catch         captures every failed SQS job, RecaseError included   (BM, EG)
server   errorMiddleware, no ctx      captures everything before baseMiddleware (401s)       (A1)
server   errorMiddleware, Stripe      captures every Stripe error before classifying it      (12)
worker   settleQueuedFailure          unknown error → "transient" → Kafka redelivers, never reported
worker   createWorkerErrorHandler     500 INTERNAL → requestLog only, never reported
```

## Roles

- **Axiom** is the firehose: every log line, warns, expected errors, rates, dashboards, threshold monitors.
- **Sentry** is the bug inbox: groups repeats into issues, knows new / regressed / resolved, and alerts on new ones.
- Every catch site calls `reportError`, which writes the Axiom line and, when the kind calls for it, the Sentry event.

## Design

### Package: `packages/errors` (`@autumn/errors`)

```
src/
├── errors.ts                        entry (like balanceEngine.ts)
├── models/                          errorKind, errorClassification, errorScope
├── classify/
│   ├── classifyError.ts             ordered classifiers, first match wins, else "bug"
│   └── classifiers/                 classifyRecaseError (+ Postgres, Stripe, Tinybird, fetch)
├── report/
│   ├── reportError.ts               classify → policy → log → capture
│   ├── reportPolicy.ts              kind → { logLevel, captureToSentry }
│   └── logReportedError.ts
└── external/sentry/                 captureErrorToSentry, errorScopeToSentryEvent, initSentry
```

- **Kind is context-free.** A 400 is `expected` from HTTP, SQS, Kafka or cron alike. Kinds: `expected`, `transient`, `bug`.
- **HTTP response shaping stays in the server** (`honoMiddlewares/errorMiddleware/`): it's the API contract, not error handling.
- **Error classes stay in `@autumn/shared`.** The package classifies and reports them; it doesn't own them.
- **Extending = one more file.** A new dependency is a new classifier; a new kind is a new policy row.

### Log shape: no new top-level Axiom fields

Axiom `express` already has nine top-level error columns (`error`, `errorCode`, `errorMessage`, `errorName`, `errorStack`,
`errorString`, `error_code`, `error_message`, `error_name`). `reportError` adds none; kind and code live inside the
existing `error` object, and org/customer/request context stays where the logger already puts it (`context.*`, `req`, `workflow`).

```
- { ...fields, errorKind, errorCode, error: errorToObject(error) }
+ { error: { kind, code, name, message, stack, cause } }
```

### Context: an `ErrorScope` per event, never the shared Sentry scope

`setSentryTags` writes to the shared scope; `initWorkers.ts` clears it once per batch while a batch's messages run
concurrently, so one job's `org_slug` can land on another job's error. Instead each boundary builds a scope and
`reportError` attaches it to that one event.

```ts
type ErrorScope = {
  service: "server" | "balance-worker";
  source: "http" | "sqs" | "kafka" | "cron" | "webhook";
  operation: string;              // "POST /v1/attach" (route template), "track" (job), "reset-cron"
  tenant?: { orgId: string; orgSlug: string; env: AppEnv };   // absent for multi-org crons
  subject?: { customerId?: string; entityId?: string };
  requestId?: string;
};
```

- Tenant is optional by design: a multi-org cron reports with `service/source/operation` only, and narrows the scope
  per org inside its loop when it has one (`{ ...scope, tenant }`).
- Built once per boundary by a converter (`autumnContextToErrorScope`, `workerRequestToErrorScope`, ...), from the same
  objects the logger context already comes from.

```
ErrorScope → Sentry event (external/sentry/errorScopeToSentryEvent)
  tags      error_kind, error_code, service, source, operation, env, org_slug     ← alert filters + Slack
  user      { id: orgId, username: orgSlug }                                       ← "orgs affected" condition
  contexts  autumn { orgId, customerId, entityId, requestId }                      ← on the event, not indexed
```

### Slack alerts

The `aggregate.ts` timeout alert (`AUTUMN-SERVER-FK`) already carried `org_slug: firecrawl`, `env: live`,
`path: /v1/events.aggregate`, `auth_type`, `customer_id` as tags; the Slack message hid them because the alert rule's
Slack action has an empty "show tags" field. Setting it (`org_slug,env,operation,service,error_kind`) is config, no code.

```
🔴 new issue      error_kind:bug env:live            → #scans, show tags org_slug,env,operation,service
🚨 escalation     same issue, > 3 orgs (users) / 1h  → #scans + mention
🟡 degraded       error_kind:transient, rate / dependency → #scans (unit 4)
```

### Frontend (vite)

Today: `@sentry/react` init with `setUser` + `org_id` tag; no error boundary, no API-error reporting.

- Render crashes: `Sentry.ErrorBoundary` at the app root → `bug`.
- API errors: the axios response interceptor decides, since it knows the request came from our own UI
  (`x-client-type: dashboard` is already sent):

```
5xx                                   → skip (backend already reported it)
4xx, code ∈ caller-mistake set        → skip (e.g. customer not found, lock conflict: user-driven)
4xx, code ∈ "our UI should never send" → bug (invalid_inputs / validation from our own form = frontend bug)
```

- Tag the event with the backend `request_id` so the Sentry frontend issue links to the Axiom request line.
- The frontend can't import `@sentry/bun`, so the package splits entries: `@autumn/errors` (models + classify, pure)
  and a server reporter; vite gets its own thin reporter over the same kinds.

## Open questions

- The "our UI should never send" code set for the dashboard: start with `invalid_inputs` + Zod validation, widen from data.
- Async-job expected errors (a customer's track returned 200, then the job refused it) aren't Sentry material, but may
  deserve a per-org counter in Axiom.
