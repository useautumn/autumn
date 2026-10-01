# Error reporting: next decisions

Status: agenda 2026-09-30, to walk through one by one with John.

| # | decision | question to settle |
|---|---|---|
| 1 | **Outcome model** | Report once, when the operation gives up (OTel: retried/handled errors aren't recorded; Sentry job integrations report after retries are exhausted). Implemented for SQS jobs: retry budget read from each queue's RedrivePolicy (prod main 10, track-async/stripe/recovery 5, batch-reset none); scan-retried failures warn; Sentry flushed on shutdown and before fatal exits. Open: `lost` label (SyncDirty drop on shutdown recovers only on the customer's next change: unverified), and withTimeout rejections for non-scan jobs are never logged at all. |
| 2 | **Transient catalogue** | Which dependency errors are transient: pg (timeout, connection), fetch/socket, Tinybird 5xx, Stripe 429/connection, SQS throttling/shutdown. |
| 3 | **Stripe `resource_missing`** | Not one answer. 7d data: `No such checkout.session: cs_test_…` in *live* webhooks, 342 lines across 20 orgs (looks like our env mismatch bug); `No such customer` from one sandbox org's API calls (their data); `No such invoice` from the sandbox dashboard. Decide per source. |
| 4 | **Text-only guardrail** | Lint rule: `logger.error` must carry `{ error }`, else `warn`; sweep the 31 `error.message` sites. |
| 5 | **Rate alerts** | 🟠 alert per dependency × operation for surfaced transients; thresholds. |
| 6 | **Balance worker + herald** | units.md unit 5 (deferred). |
| 7 | **Crons, frontend** | units.md units 6–7. |
| 8 | **Process** | ownership rules (suggested assignee), weekly review, ≤ 3 🔴/day budget. |
