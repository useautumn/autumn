# Track as a ledger action

Same shape as `billing/v2/actions/attach`: `track.ts` reads as numbered phases; per-action `setup/`,
`compute/`, `errors/`, `respond/`; the shared phases (`execute`, the entitlement/controls resolution)
live beside the actions. The centre of gravity is **`BalancePlan`** — the desired change to subject
state — which `execute` applies to rows and the ledger entry carries verbatim.

One difference from the server, on purpose: the server runs one Lua call **per feature** and each call
sees the previous one's writes. The ledger loads one in-memory `DeductionContext` for every entitlement
the command can touch, then folds the feature deductions **sequentially against that one context** —
one fold per command, one entry per command.

## Tree

```
internal/balances/
├── actions/track/
│   ├── track.ts                    1 setup · 2 compute · 3 errors · 4 execute · 5 respond
│   ├── setup/
│   │   ├── setupTrackContext.ts    orchestrator → TrackContext
│   │   ├── resolveDeductionOptions.ts   overage behaviour → flags; is_consumption
│   │   └── resolveTokenDeductions.ts    track_tokens pricing               (later)
│   ├── compute/
│   │   ├── computeTrackPlan.ts     deductions, in order, over one context → TrackPlan
│   │   └── fold/                   the Lua core, pure over DeductionContext
│   │       ├── foldDeduction.ts    unlimited sink → target → rollovers → pass 1 → pass 2 → round
│   │       ├── calculateChange.ts  floor / ceiling precedence
│   │       ├── deductFromMainBalance.ts   entity cases                     (later: entities)
│   │       ├── deductFromRollovers.ts                                       (later)
│   │       ├── resolveAvailableOverage.ts spend-limit gate                 (later)
│   │       ├── resolveWindowHeadroom.ts   usage-window gate                (later)
│   │       └── incrementUsageWindows.ts                                     (later)
│   ├── errors/
│   │   └── handleTrackComputeErrors.ts  reject → InsufficientBalance; lock exists; all-replay
│   ├── respond/
│   │   ├── buildTrackResponse.ts   { customer_id, entity_id, event_name, value, balance, balances, deductions }
│   │   ├── resolveReportedFeature.ts    which feature is `balance`
│   │   └── toTrackDeductions.ts    mutations → deductions[]
│   └── types/
│       ├── trackContext.ts
│       └── trackPlan.ts            BalancePlan + deductedByFeatureId
├── common/                         shared with check and finalizeLock — nouns, not phases
│   ├── features/
│   │   └── resolveFeatureDeductions.ts  feature_id | event_name → FeatureDeduction[]
│   ├── entitlements/
│   │   ├── selectCustomerEntitlements.ts  relevant features, status, expiry at cmd.at, entity scope
│   │   ├── sortCustomerEntitlements.ts    shared sortCusEntsForDeduction
│   │   ├── buildEntitlementDeductions.ts  credit_cost, usage_allowed, min/max, unlimited hoist
│   │   └── loadDeductionContext.ts        rows → in-memory balances/rollovers/windows
│   ├── controls/                   overage_allowed, spend limits, usage-window limits   (later)
│   └── apiBalance/
│       └── buildApiBalance.ts      rows → ApiBalanceV1 (shared getApiBalance)
├── execute/
│   ├── applyBalancePlan.ts         plan → sqlite repos (cusEnts, rollovers, windows, locks)
│   └── toLedgerEntry.ts            plan + version → LedgerEntry
└── types/
    ├── featureDeduction.ts
    ├── entitlementDeduction.ts     one row of customer_entitlement_deductions
    ├── deductionContext.ts         the Lua `context`, spanning all features of the command
    └── balancePlan.ts              mutations · after · rolloverUpdates · usageWindowMutations · lockReceipt · remaining
```

`track.ts`:

```ts
export const track = ({ ctx, command }) => {
  const trackContext = setupTrackContext({ ctx, command });          // 1
  const plan = computeTrackPlan({ ctx, trackContext });               // 2 — pure
  handleTrackComputeErrors({ ctx, trackContext, plan });              // 3 — throws, nothing written
  const entry = applyBalancePlan({ ctx, trackContext, plan });        // 4 — rows + LedgerEntry
  return { result: buildTrackResponse({ ctx, trackContext, plan }), entry };  // 5
};
```

## Where every server decision lands

Row numbers are the inventory's (`plans/subject-engine-shadow/track-inventory.md`).

| rows | decision | home |
|---|---|---|
| 1–4 | body schema, timestamp, behaviour vocabulary, V1.2 `properties.value` | **server** (API validation; the command carries a validated body) |
| 5–7 | feature_id / event_name → deductions, 404s | `common/features/resolveFeatureDeductions` |
| 8–9, 16–17 | async gate, shed, fail-open | **server** wrapper (`runTrackWithRollout`) |
| 10–14 | token pricing | `actions/track/setup/resolveTokenDeductions` (later) |
| 15 | client idempotency (`Idempotency-Key`, `body.idempotency_key`, Dynamo claim) | **server** — an API-contract concern, never in the ledger |
| 34, 60, 81, 99 | Redis per-feature replay key, duplicate skip, all-replay | ledger `serials` keyed by command id — the writer loop's own exactly-once table, not client idempotency; a retried command returns the stored result |
| 18 | reject + event_name → 400 | `errors/handleTrackComputeErrors` (pre-compute guard) |
| 19–22, 31 | subject read, cache validity, hydrate, 404s | `common/entitlements/loadDeductionContext` over resident rows; import on first sight (`subjects/actions/importSubject`); 404 when import finds nothing |
| 23–29 | lazy period reset, rollover mint, usage-window roll | **not now** — out of scope until track is complete; when built it is compute (emits `PeriodRolled` mutations into the same plan), not setup |
| 30, 33 | lazy migrations, auto-create customer/entity | **server** for now (they mutate customer state before the mirror; become commands later) |
| 32 | drained-loose filter | `selectCustomerEntitlements` |
| 35, 80, 89 | rollback snapshot, SubjectViewChanged retry, PG rollback | gone — single writer + `SAVEPOINT` |
| 36, 57, 65 | options, is_consumption, behaviour flags | `setup/resolveDeductionOptions` |
| 37, 87 | paidAllocatedV1 detection, allocated v1 mid-cycle invoice | **server** keeps these tracks on `runPostgresTrackV3` and does not mirror them; ledger compute refuses an allocated-v1 entitlement (`PaidAllocatedUnsupported`, no entry). Revisit with the attach intent (§10) — or migrate the remaining v1 customers to v2 |
| 38, 50, 55 | clocks and ids: window `now`, `new_window_id`, lock `created_at`/`ttl_at` | `cmd.at` and ids minted in `setup` — compute never reads a clock |
| 39, 58–59, 63 | per-feature Lua loop, KEYS, epoch guard, context load | one `loadDeductionContext`, one fold; epoch guard unnecessary |
| 40–42 | relevant-feature expansion, selection, sort | `common/entitlements/` (expansion added with credit systems) |
| 43–49 | controls: unlimited drops windows, spend limits, overage_allowed, usage-window limits | `common/controls/` (later) |
| 51–54 | credit cost, per-cusEnt deduction row, unlimited hoist, rollover order | `common/entitlements/buildEntitlementDeductions` |
| 56 | KEYS build | gone |
| 61–62, 64 | empty set, window participation, unwind | `compute/fold` (unwind with finalizeLock) |
| 66–74 | unlimited sink, target_balance, rollovers, pass 1, pass 2, spend gate, window gate, precision, reject | `compute/fold/*` — one file per rule family |
| 75, 77–78 | counters, lock receipt, commit + aggregated balances | `execute/applyBalancePlan` (aggregated: `compute/fold/foldAggregatedBalances` feeds `after`) |
| 76, 79, 83–84, 98 | modified ids, result payload, accumulate, pruning | `BalancePlan` is built once; no accumulation, no pruning |
| 82 | rethrow other Lua errors | `errors/` |
| 85–86, 88 | apply to subject | `execute/applyBalancePlan` |
| 90–97 | webhooks: usage alerts, limit_reached, threshold, auto top-up | **journal consumers** — the entry carries mutations + `after`; before = after − delta |
| 100 | sync enqueue | gone — the projector |
| 101–103, 105–107 | deductions[], product attribution, AI credit_cost property, reported feature, balance/balances, assembly | `respond/` (102–103 feed the event → consumer) |
| 104 | event enqueue | **journal consumer** |
| 108–109 | version down-transform, HTTP status | **server** (ledger returns V3) |
| 110–112 | error mapping, PG fallback | `errors/` for ledger codes; PG fallback gone |

Two latent server bugs the port must not copy: `executeRedisDeductionV2.ts:96` is dead (the paidAllocated
lock check sits after an unconditional throw), and event emission differs between the Redis and PG lanes
(`runPostgresTrackV3.ts:62` skips events when `idempotency_key` is set).

## The plan type

```ts
type BalancePlan = {
  mutations: MutationLogItem[];                        // the Lua mutation_logs, unchanged shape
  after: Record<customerEntitlementId, SubjectBalance>;
  rolloverUpdates: Record<rolloverId, RolloverBalance>;
  usageWindowMutations: UsageWindowMutation[];
  lockReceipt?: LockReceipt;
  remaining: number;
};
type TrackPlan = BalancePlan & { deductedByFeatureId: Record<featureId, number> };
type LedgerEntry = SubjectRef & { version; command_id; at } & BalancePlan;
```

## Unit 2 scope (this branch)

Customer-level entitlements, `feature_id` only, `cap` / `allow` / `reject`, refunds, unlimited:

- `setup/`: `resolveDeductionOptions`; `common/features/resolveFeatureDeductions` (feature_id branch);
  `common/entitlements/{select,sort,buildEntitlementDeductions,loadDeductionContext}` with credit_cost 1
- `compute/fold/{foldDeduction,calculateChange}` — rows 66, 69–70, 73–74
- `errors/handleTrackComputeErrors` — rows 18, 74
- `execute/{applyBalancePlan,toLedgerEntry}` — cusEnt balance/adjustment; per-customer version
- `respond/*` — rows 101, 105–107
- `subjects/actions/importSubject` becomes real (`@autumn/postgres` repos → sqlite repos)

Deferred, each a new file in an existing folder: tokens, credit systems (40, 51), controls (43–49),
rollovers (68), entities (deductFromMainBalance cases 1–2), windows (72, 75), locks (55, 64, 77),
aggregated balances (78). Lazy resets (23–29) and allocated v1 (37, 87) are out of scope, not deferred.

## Case matrix

| # | state | command | expect |
|---|---|---|---|
| 1 | one ent 100 | 5 | 95, deducted 5, one entry v+1 |
| 2 | ents 30 + 100 in shared sort order | 50 | 0 + 80 |
| 3 | 10, overage not allowed | 15 | 0, remaining 5 (cap) |
| 4 | 10, overage allowed | 15 | −5 (pass 2) |
| 5 | 10, `reject` | 15 | `InsufficientBalance`, no entry, state unchanged |
| 6 | 95 of 100 | −5 | 100 (ceiling `max_balance + adjustment`) |
| 7 | unlimited | any | unchanged, `unlimited: true`, no entry |
| 8 | no entitlement | 5 | `balance: null`, no entry |
| 9 | same command id twice | replay | stored response, one entry |
| 10 | unknown feature | 5 | 404, no entry |
| 11 | unknown customer | 5 | 404 after import finds nothing |
| 12 | `event_name` + `reject` | 15 | 400 before compute |
| 13 | entitlement is allocated v1 | 5 | `PaidAllocatedUnsupported`, no entry |

Integration: `server/tests/integration/ledger/track.test.ts` — `initScenario` → attach → one track →
balance 95 and one journal entry.
