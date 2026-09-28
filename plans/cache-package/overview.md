---
author: john + claude
feature: cache-package
date: 2026-09-24
status: draft, not yet approved
---

# `@autumn/cache`: the misc cache as a package

Herald needs the auto top-up burst suppression key (`plans/balance-worker-auto-topup/`), and that
key lives on the misc cache, which only the server can open today. The package is the misc cache's
client and the cross-request actions on it, so any process reaches the same keys through the same
functions. Modelled on `packages/postgres` (client + ctx + repos) and `packages/edge-config`
(config defined in the package, bound by each consumer).

## What exists today (server/src/external/redis)

```
initUtils/createRedisClient.ts     ioredis factory: TLS DNS lookup, timeouts, resend/retry policy,
                                   then instrumentRedis (otel) + registerRedisCommands (Lua) on the instance
initUtils/redisConfig.ts           MISC_CACHE_DRAGONFLY_PRIVATE_URL / PUBLIC_URL, ECS prefers private
miscCache/miscRedisInstances.ts    main (env, lazy) · backup (edge config, AES-encrypted, hot-swapped, private-or-public)
miscCache/getMiscRedis.ts          active instance per the misc-redis edge config, backup falls back to main
miscCache/resolveMiscRedis.ts      ramp slice by requestId · targets (active + ramp target) · forEachTarget
miscCache/getFromMiscRedisTargets  read active first, then any live target
miscCache/setOnMiscRedisTargets    write-through SET on every target · mirror a won lock to the ramp target
utils/runRedisOp.ts                not-ready guard · budget · classify · throttled warn · standby/read-pool retry (V2 only)
utils/tryRedisNx.ts                SET NX → claimed / exists / unavailable
actions/autoTopUpSuppression/      pending key (claim/clear/keep) · failure-webhook dedup key
internal/misc/miscRedisConfig/     the edge config schema + store (activeInstance, ramp, backup)
```

Server-only pieces the package must not drag along: otel instrumentation, the Lua registry, the
logtail logger, `AutumnContext`, and the standby router / read pool (they serve the V2 subject cache,
which is being retired).

## Target

```
packages/cache/src/
├── cache.ts                          entry
├── client/
│   ├── createRedisClient.ts          the ioredis factory; ctx.onClientCreated lets a process add otel + Lua
│   ├── redisDnsLookup.ts             moved
│   └── types/redisClient.ts          RedisClientConfig, CacheLogger
├── ops/
│   ├── runRedisOp.ts                 runRedisOp + tryRedisOp: not-ready guard, budget, classify, throttled warn
│   ├── tryRedisNx.ts
│   └── redisErrors.ts                RedisUnavailableError, isTransientRedisError, isConnectionLevelRedisError
├── misc/
│   ├── createMiscCache.ts            main · backup · active · resolve({ requestId }) · targets · forEachTarget
│   ├── miscCacheTargets.ts           getFromTargets · setOnTargets · mirrorSetOnRampTarget
│   └── types/miscCache.ts            MiscCache, MiscCacheContext { env, config: () => MiscRedisConfig, decrypt, logger }
└── actions/
    └── autoTopupSuppression.ts       claim/clear/keep pending key · webhook suppression; takes { ctx: MiscCacheContext-ish, orgId, env, … }

packages/edge-config/src/configs/miscRedis/miscRedisEdgeConfig.ts   schema + key, as dbControl
packages/env/src/cache.ts                                            MISC_CACHE_DRAGONFLY_*_URL · onEcs · region
```

Bindings:

```
server   external/redis/getMiscCache.ts      memoized accessor: env + miscRedisConfigStore + decryptData + instrument/Lua hook
         miscCache/*.ts, utils/runRedisOp.ts  thin forwards, so 36 getMiscRedis callers and 26 tryRedisOp callers stay put
         utils/runRedisOp.ts                 keeps the standby/read-pool variant for V2, built on the package's errors
herald   setup/getMiscCache.ts               accessor: env + its own edge-config registry entry for miscRedis + decrypt
```

Rules this follows: the logger rides in `ctx` and is remembered per client (a `WeakMap`), so an op
never needs it passed; a `create*` is called only from a `get*`; actions take `{ ctx, ...params }`
with `orgId`/`env` explicit, never `AutumnContext`.

## Decisions to make

| # | question | recommendation |
|---|---|---|
| 1 | Standby router / read pool in the package? | No. They exist for the V2 subject cache; the misc client is a plain connection. The server's `runRedisOp` keeps that variant and imports the package's errors. |
| 2 | Where does AES decryption of the backup connection live? | `decryptData`/`encryptData` move to `@autumn/shared` (pure node crypto, `ENCRYPTION_KEY`); server re-exports. Needs your ok: it adds a shared util. |
| 3 | Instrumentation and Lua | Injected: `ctx.onClientCreated({ redis, label })`. The server passes otel + Lua; herald passes nothing. |
| 4 | Actions moved now | Only auto top-up suppression. Locks, checkout cache, org caches follow one by one as a process outside the server needs them. |

## Units

See `units.md`.
