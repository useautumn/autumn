# Unit 3c: `logger.error` is the report

Status: S1–S3 implemented (server). Balance worker wiring moves to unit 5 (it has no Sentry init yet).

## Why

Today a bug reaches Sentry only if someone remembers `Sentry.captureException` next to their
`logger.error`. 13 server files do it by hand (11 beside a `logger.error`, 2 without); the other
~230 `logger.error` sites never reach Sentry. The logger already knows who a line is about:
`addAppContextToLogs` binds `context.org_id/org_slug/env/customer_id` in HTTP
(`analyticsMiddleware`), SQS (`createWorkerContext`), Stripe/Vercel/RevenueCat webhooks and
migrations; `addWorkflowToLogs` binds `workflow.name/id`; HTTP lines carry `req` per call.

## Research

- pino's `hooks.logMethod(args, method, level)` runs on every call, sees the raw `Error` before
  the `normalizeErrorValues` formatter, and `this.bindings()` returns the child context
  (verified with a probe: org context + workflow + raw Error all visible).
- Volume, Axiom `express`, 24h: 11,047 `ERROR` lines, 8,675 with an error attached. Top named
  sources are KafkaJS connection chatter; those should be `warn`.
- Call-site shapes (`logger.error` in server/src, 242): ~140 attach the Error (`{ error }`,
  `error,`, `err`), 31 pass `error.message` (string, no stack), 50 are string-only.
- The balance worker has no Sentry init; `reportWorkerError` already logs one line per failure.

## Design

```
logger.error(msg, { error })
  │  pino hooks.logMethod  (installed at logger creation)
  ▼
@autumn/errors  errorLogHook
  error = findLoggedError(args)      raw Error, or none
  none            → log as is
  classification  = classifyError(error)
  args            = error field → { kind, code, name, message, stack, data }
  log
  level ≥ error && kind = bug
                  → Sentry.captureException(error, tags from this.bindings() + args)
```

- **Capture moves into the logger.** `reportError` shrinks to "pick the level, log it";
  `logReportedError` folds into the hook's annotation; `ErrorScope` and
  `autumnContextToErrorScope` are replaced by tags read from log context, so there is one source
  of truth for "who" and no shared Sentry scope.
- **Tags from log context:** `org_id, org_slug, env` ← `context.*`; `customer_id`;
  `operation` ← `workflow.name` | `req.name`; `request_id` ← `req.id` | `workflow.id`;
  `service` ← pino `base.service`; `error_kind, error_code` ← classification.
- **Where things live:** the hook and its helpers in `@autumn/errors` (`src/logging/`);
  `@autumn/logging` only gains a generic `hooks` pass-through, so no dependency cycle
  (`errors → logging`, never back).
- **Text-only error lines count too.** `logger.error(`x failed: ${e.message}`)` is captured as a
  `LoggedMessageError` built (never thrown) in the hook; its stack points at the call site, so Sentry
  groups one issue per call site. The hook is wrapped so it can never break a log line or the process.
- **`reportError` keeps the error text in `msg`:** `<operation> failed: <message>`.
- **Levels are the caller's.** The hook never changes a line's level; expected errors logged at
  `error` are annotated but not captured.
- **Kill switch:** capture gated by `SENTRY_CAPTURE_LOGGED_ERRORS` (default on in prod) plus a
  DSN rate limit, so turning it on can't flood the quota.

## Slices

| # | slice | ends with |
|---|---|---|
| S1 | Package: `logging/createErrorLogHook.ts`, `findLoggedError.ts`, `annotateLoggedError.ts`; `external/sentry/logContextToSentryEvent.ts`. `reportError` → level + log only. Delete `ErrorScope`, `errorScopeToSentryEvent`, `logReportedError`. | unit tests with a real pino child: bug captured with org tags, expected not captured, warn never captured |
| S2 | Wire: server `initLogger` and `@autumn/logging` `createLogger` accept `hooks`; server installs the hook; `errorMiddleware`/`processMessage` drop `autumnContextToErrorScope`. | parity probe (responses) + probe: HTTP and SQS bug → one Sentry event with org tags |
| S3 | Cleanup: delete the 11 redundant `Sentry.captureException`; turn the 2 bare ones (Stripe webhook, Tinybird) into `logger.error`; delete `sentryUtils.ts`. | `rg "Sentry\\."` only in `packages/errors` + `sentry.ts` init |

## Open

- HTTP `operation` is `req.name` (concrete path) until the route template is put on the request
  log context; fine for filtering by org, weaker for per-route alerts.
- The 31 `error.message` sites lose their stack and won't reach Sentry until they attach the Error.
