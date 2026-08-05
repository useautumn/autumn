# Misc-cache actions

The ONLY place allowed to issue Redis commands against the misc cache. Domain
code calls named actions; it never touches a client directly.

One folder per key family. Each family file follows the same shape:

```ts
// external/redis/actions/<family>/<family>Cache.ts
const FAMILY_CACHE_TTL_SECONDS = 3600;

export const buildFamilyCacheKey = ({ ... }) => `family:${...}`;

export const getCachedFamily = async ({ ..., requestId }) => { ... };
export const setCachedFamily = async ({ ... }) => { ... };
export const clearFamilyCache = async ({ ... }) => { ... };
```

Rules:

- **Instance choice is explicit per family.** Read-through caches (a miss
  recomputes from the source of truth in the same request) resolve via
  `resolveMiscRedis({ requestId })` and invalidate via
  `forEachMiscRedisTarget`. Everything else — locks, rate limits, and any key
  written by one request and read by another — uses `getMiscRedis()` (pinned).
- **Fail-open by default** through `tryRedisOp`/`tryRedisRead`/`tryRedisWrite`
  with the instance passed explicitly; a Redis outage degrades to the source
  of truth, never to a 500.
- **Runtime imports from `internal/` are forbidden** (type-only imports are
  fine). Read-through orchestration ("miss → service → set") stays in the
  domain, or the caller passes a `fetch` callback.
- **Key formats are pinned** in `tests/unit/redis/misc-redis-keys.test.ts`.
  Extend it when adding a family; changing a key format is a deliberate
  cache-migration decision, not a refactor side effect.
