# Units of work

Thin slices, each reviewable alone. Uncommitted until John says to commit.

| # | unit | ends with |
|---|---|---|
| 1 | **Package + SQS catch-all.** `@autumn/errors` with `classifyError` (RecaseError < 500 → expected, else bug) and `reportError`; `processMessage` catch calls it. Implemented, uncommitted on `errors-core`. | package unit tests; server `tsgo` |
| 1b | **Log shape.** Fold kind/code into the existing `error` object; drop `fields` (context already rides on the logger). Implemented. | `reportError` test asserts the logged payload |
| 2 | **ErrorScope.** Model + `errorScopeToSentryEvent`; `reportError` attaches tags/user/contexts per event; `processMessage` builds its scope from the worker ctx (no tenant when there's no ctx). Implemented. Config still open: set Slack "show tags" on alert `16568255`. | test: two concurrent reports keep their own `org_slug` |
| 3 | **HTTP boundary.** `errorMiddleware` → `reportError` with `autumnContextToErrorScope`; the no-ctx branch reports with `operation` only (a pre-ctx 401 is now a warn, still answered 500). Response bodies and log messages unchanged. Stripe errors stay `bug` until unit 4. `RecaseError` ≥ 500 (49 throw sites) now reaches Sentry. Implemented. | integration test: 4xx not captured, 500 captured with org tags |
| 3b | **Server error boundary cleanup, zero customer-facing change.** `errorSkipMiddleware` deleted. Route-free Stripe caller rules → `@autumn/errors` `classify/stripe/` (so SQS jobs get them too); the 3 route-scoped ones stay in `errorMiddleware/callerErrors/stripeRouteErrorRules.ts`. Log message `<operation> failed`; `org_id` tag. Implemented; old vs new responses identical on 18 branches. | parity probe; package tests |
| 4 | **Transient.** `transient` kind + policy row (Sentry `warning`, fixed fingerprint per dependency); classifiers for Postgres, Tinybird, Stripe 429, fetch/socket. | classifier unit tests |
| 5 | **Balance worker.** `settleQueuedFailure` unknown → `reportError` (still redelivered); `createWorkerErrorHandler` 500 → `reportError`; `service: "balance-worker"`. | worker unit tests |
| 6 | **Crons + multi-org jobs.** Reset loops, lock sweep, batch reset report with a tenant-less scope, narrowed per org in the loop. | cron unit test |
| 7 | **Frontend.** Error boundary; axios interceptor classifies dashboard 4xx; backend `request_id` on the event. | manual: forced render error + invalid form submit show in Sentry |
| 8 | **Long tail.** The remaining direct `Sentry.*` calls → `reportError`; delete `setSentryTags`/`getSentryTags`; lint-ban `@sentry/*` outside `packages/errors`. | `rg "Sentry\\."` only in the package |
| 9 | **Alerts.** New-bug, escalation and transient-rate rules as in overview.md. | test notification in #scans |
