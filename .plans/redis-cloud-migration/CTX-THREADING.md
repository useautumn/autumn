# ctx threading for `external/redis/actions/` (branch `feat/redis-actions-ctx`)

Problem: every action logs through the module-level `logger`, so loglines are orphaned
(no request/org/env). Goal: intentional ctx threading — not spraying ctx everywhere.

## Decision criteria

An action takes `ctx: AutumnContext` only when ALL of:
1. **Every caller has a ctx in scope** (verified per module below).
2. It gains something concrete: request-scoped logs, `ctx.id` replacing a `requestId?` param, or it already takes ctx for key-building.

An action stays ctx-free when it runs **before ctx exists** (auth paths that CREATE the
context) or **outside any request** (worker poll loop). Forcing ctx there would mean
fabricating fake contexts — worse than a narrow `requestId?` param.

## Verdict: do NOT thread logger into runRedisOp/tryRedisOp

- Its only logline (`warnRedisUnavailable`) is deliberately **rate-limited to one per
  source per 30s** — an infra-health aggregate, not a request event. Attaching one
  arbitrary request's ctx to a warn that summarizes ~hundreds of suppressed failures
  mislabels the event (the suppressed failures belonged to other requests/orgs).
- ~100+ call sites of churn for that mislabeled line.
- The per-request signal ("this request lost its cache read") belongs at the ACTION
  boundary: Tier A actions log via `ctx.logger` in their `onError`/warn paths.

## Tier A — takes `ctx: AutumnContext` (IMPLEMENTED on this branch)

Concrete gain per action: `ctx.id` replaces `requestId?` params, and consequential
silent failures now warn via `ctx.logger` (`onError`, fields nested under `data`).

| Action | Callers (all ctx-ful) | Implemented |
|---|---|---|
| checkoutSessionLock | billing v2 attach/schedule/execute, checkCheckoutSessionLock | already took ctx — no change |
| migrationCustomerLock | migrateCustomer, trigger task | already took ctx — no change |
| expiredCustomerProductsCache | webhook tasks via `expiredCache` wrappers (sub deleted, phase changes, invoice created/paid/finalized) | ctx + get/set warns |
| savedViewsStore | 3 savedViews handlers | ctx replaces orgId/env params (keys from ctx.org/env); write warns (Redis is the only store) |
| trmnlDeviceStore | 3 trmnl handlers + trmnlAuthMiddleware (ctx exists mid-auth) | ctx; write/delete warns |
| topEventNamesCache | getTopEventNames (handler-fed) | ctx.id replaces requestId |
| migrationCancelToken | cancel handler + withMigrationRunTracking | set/clear take ctx + warns; `isMigrationCancelRequested` stays ctx-free (gates run at task boot, pre-ctx) |
| stripeSubscriptionLock | attach/billing/webhook handlers | ctx; get+set warns (silent failure = lost webhook echo-suppression) |

## Tier B — ctx-free by nature (keep `requestId?`; documented why)

| Action | Why no ctx |
|---|---|
| secretKeyCache | `verifyKey` runs DURING auth — it creates the org context; only `{db, key, requestId}` exists |
| customerJwtAuthCache | same: `getCustomerJwtAuth` pre-ctx; `customerJwtEpoch` has neither ctx nor requestId |
| orgWithFeaturesCache | on the pre-ctx auth path via `getCustomerJwtAuth` → `OrgService.getWithFeatures`; `clearOrgCache` also called from tests/scripts with only `{db, orgId}` |
| autumnCheckoutCache | (moved from Tier A at impl) `getCheckoutFromCacheOrDb` is the checkout-page bootstrap — it loads the checkout the middleware builds ctx FROM; DB fallback makes failures non-critical |
| productsCache | (moved from Tier A at impl) `ProductService`/`detectProductVariant`/`copyProductForOrgs` are deliberately db-scoped (`{db, orgId, env}`) — requiring ctx would refactor the service layer; invalidate warn already carries orgId/env |
| modelPricingCache | (dropped at impl) global non-org key, no logs, no requestId, stale-copy fallback — ctx would be pure decoration |
| oauthStateStore | (moved from Tier A at impl) read side is the provider-redirect callback (raw hono ctx; org derived FROM the state) |
| oauthRefreshReplay | oauth token endpoint — pre-ctx (it mints the tokens) |
| queueCapacityLease | worker poll loop, before any message/request exists — process-level |
| idempotencyKeys (redis leg) | dying code (Dynamo authoritative, kept for rollback) — churn not worth it |

## Tier C — never (process-level infra, module logger is CORRECT here)

`runRedisOp`/`tryRedisOp`, `lockUtils/*` primitives, `miscCache/*` (resolveMiscRedis,
setOnMiscRedisTargets, getFromMiscRedisTargets, instance/config machinery), availability
monitors. Their logs describe the PROCESS's relationship to Redis, not any request.

## Open judgment calls (John)

1. `clearSecretKeyCache` warn is the one orphaned logline in Tier B — its caller
   (`handleDeleteSecretKey`) HAS ctx. Accept a narrow optional `logger?` param on the
   clear function only, or leave module logger?
2. Tier A rows marked "verify at impl": `eventActions`/`getModelPricing` call chains
   need a signature check before assuming every caller carries ctx.
3. Convention for Tier A signatures: `{ ctx, ...domainParams }` first-position, matching
   the rest of the codebase.

## Implementation order (single PR)

1. Tier A actions one commit each ~~or grouped by domain~~ — grouped: (checkout+locks),
   (products/org-adjacent caches), (misc stores), (migration+webhook locks).
2. Update callers; delete now-unused `requestId?` plumbing params from intermediate
   helpers (e.g. `getOrgWithFeaturesCached` keeps its — Tier B).
3. Biome + `bun ts` + targeted unit tests per group; no behavior changes expected —
   assert with existing suites.
