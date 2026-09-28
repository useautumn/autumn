# Units of work

Landed as slices of 1–3 files, each explained before the next.

| # | unit | ends with this passing |
|---|---|---|
| 1 ✅ | **Package skeleton + client + ops.** `packages/cache`: `createRedisClient` (with the injected `onClientCreated` hook and a per-client logger), `redisDnsLookup`, `runRedisOp`/`tryRedisOp`/`tryRedisNx`, the errors. No consumer yet. | package unit tests: not-ready guard, budget timeout, NX outcomes, connection-level classification. |
| 2 ✅ | **Misc cache.** `miscRedisEdgeConfig` in `packages/edge-config`; `createMiscCache` (main, backup, active, ramp resolve, targets, forEachTarget, get/set/mirror on targets); `packages/env/cache.ts`. Server: `getMiscCache()` accessor, `miscRedisConfigStore` bound to the package config, every `miscCache/*.ts` a forward, `createRedisClient` a forward with otel + Lua. | `misc-redis-resolve.test.ts` moved to the package and green; server unit suite at baseline; a `customers.get` through the dev stack (misc cache in use). |
| 3 ✅ | **Auto top-up suppression from both processes.** The action in the package; the server's three callers pass `{ ctx: { miscCache, logger }, orgId, env, … }`; herald `getMiscCache()` + its edge-config registry entry. | server `auto-topup-lock-retry-suppression` integration green; a herald unit test claims the key through a fake misc cache. |
