---
author: john + claude
feature: customer-cache
date: 2026-09-28
status: research-in-progress
---

# How a check is answered today

scenario · the customer's Next.js server calls `autumn.check({ customerId:"cus_abc", featureId:"api_calls", requiredBalance: 100 })`

```
customer app ── @useautumn/sdk client.check ── POST api.useautumn.com/v1/balances.check
                 funcs/check.ts:118                          │
                 hooks: FailOpenHook (5xx → allowed:true)     │
                                                              ▼
server  handleCheck                                  api/check/handleCheck.ts:59
          product_id?            → handleProductCheck                     :99
          rollout on for cus?    → runBalanceWorkerCheck                  :109
              plain check        → client.check (1 HTTP to the owner)   runBalanceWorkerCheck.ts:51
              send_event | lock  → worker track                          :57-73
              worker unreachable → 202 { allowed:true } fail-open        :114-123
          else                   → legacy Redis Lua / Postgres FullSubject :141
                                                              │
worker  receiveCheck → readCurrentSubject (advance resets) → computeCheck → { result, state, catalog }
                                                              │
server  balanceWorkerCheckReply: render ApiBalanceV1 from state+catalog, version-transform down
                                                              ▼
customer app  { allowed:false, balance:{ granted:1000, remaining:95, usage:905, overage_allowed:false,
                next_reset_at, breakdown:[…], rollovers:[…] }, flag:null }
```

Response schema: `CheckResponseV3Schema` (`shared/api/balances/check/checkResponseV3.ts:10-50`):
`allowed, customer_id, entity_id?, required_balance?, balance: ApiBalanceV1 | null, balances?, flag, preview?`.
`ApiBalanceV1` (`apiBalanceV1.ts:110-158`) carries `granted, remaining (≥0), usage, unlimited,
overage_allowed, max_purchase, next_reset_at, breakdown[], rollovers[]`. Older API versions get
`balance` as a number and `included_usage` through the version transform.

## Every request is one round trip to Autumn

Nothing between the customer app and the worker caches a verdict. The FullSubject Redis cache is
Autumn-side and being retired by the worker; the worker's memory is Autumn-side. The only
customer-side path is the React hook's local check over a fetched customer object
(`getLocalCheckResponse.ts`), which uses a weaker predicate than the worker (no spend limits, usage
limits, entity scope, rate cards; see the check page).

## Where the SDK could be told to look elsewhere

| surface | hook point |
|---|---|
| Node SDK | `SDKOptions.serverURL`, `httpClient` (custom `fetcher`) (`lib/config.ts:13-41`, `lib/http.ts:36-50`); hook registry `SDKInit / BeforeRequest / AfterSuccess / AfterError` (`hooks/registration.ts:11-17`) |
| backend handler (`autumnHandler`) | `autumnURL`, overridable `routes` (`coreHandler.ts:17-42`) |
| React | `AutumnProvider { backendUrl, pathPrefix, headers }`; the client has no network `check` route at all |

Catch: `FailOpenHook.sdkInit` overwrites `opts.httpClient` unless `failOpen:false`
(`failOpenHook.ts:32-55`), so a user-supplied transport is silently dropped by default.

Alon's 2026-09-15 prototype put the customer-side read in the SDK as
`hooks/localCacheHook.ts` + `local-cache/{contract,kv-reader}.ts` (screenshot in
`#ext-autumn-alien`); the hook shape matches the registry above.

## The sibling reads a cache would be asked for next

| query | route | shape |
|---|---|---|
| `customers.get` | `/v1/customers.get` | `ApiCustomerV5`: `balances: Record<featureId, ApiBalanceV1>`, `flags`, `subscriptions`, `billing_controls` |
| `entities.get` | `/v1/entities.get` | `ApiEntityV2`: same maps for one entity |
| React `useCustomer` | `get_or_create` with `balances.feature` expand forced (`routeConfigs.ts:60-69`) | the object the local check reads |

Both are rendered from the same `{ state, catalog }` the worker returns for a check
(`readBalanceWorkerSubject.ts` → `workerStateToFullSubject`), plus subscriptions and invoices read
from Postgres beside it.
