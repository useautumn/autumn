# Balance engine: one command protocol, track as setup → compute → mutation

2026-09-17 · john/one-record · b29bcb3418 · research stage, not yet approved

Follows `plans/balance-worker-customer-state.md` (units 0–9 done). This plan owns the
engine's business logic: every command reads as the same phases, and track carries the
whole Lua deduction (rollovers, two passes, credit systems, controls, windows, entities).

## Context

### what the engine is today
[packages/balance-engine/src/commands/ · common/deduction/computeDeduction.ts]

```
track       classify → reject? → computeDeduction (one pass) → mutation → validate   1 file
check       classify → balance → allowed                                             1 file, inline
initialize  inserts → mutation                                                       1 file
```

- Three commands, three shapes: track returns `{ kind: "new", mutation }`, check returns
  `{ kind: "decided", allowed, balance, … }`, initialize returns `initialized | duplicate |
  already_initialized` with a `state`. Only track has a `Result` and an echo.
- `computeDeduction` is one pass: cap = min(value, Σ max(balance, 0)); overflow = push the
  *last* row negative. The Lua drives the *first* `usage_allowed` row negative. Same answer
  for one row, wrong for two.
- `fullSubjectToCustomerEntitlements` filters expiry with `Date.now()` → replay of a
  mutation is not deterministic. Must take `now = command.occurredAt`.
- Gates on the server (`validateMeteringEntitlement`) refuse everything the engine can't do:
  credit systems, unlimited, pooled, entity, overage, usage_limit, billing controls,
  past_due, priced, rollovers, replaceables, additional_balance, negative balance,
  reset_due, expired. Each engine unit lifts gates.

### what track really does
[server/src/_luaScriptsV2/fullSubjectDeduction/ 3.6k lines · utils/deductionV2/prepareFeatureDeductionV2.ts]

```
track V on feature F                    V > 0 deduct · V < 0 refund
│
├ setup   rows      = funding rows for F (fundsFeatureId), sorted by
│                     sortCusEntsForDeduction (entity-first when entity
│                     track, boolean, credit systems last, unlimited,
│                     next_reset_at, interval, expires_at, add-on, prepaid)
│         per row   creditCost / rateCard, usageAllowed, minBalance
│                   (-maxOverage), maxBalance (starting), unlimited
│         rollovers = every row's, tagged creditCost, expires_at asc
│         policy    allowsNegative     = allow | overflow
│                   enforcesSpendLimit = overflow | cap | reject
│                   bypassesWindows    = overflow
│
├ compute remaining = V           (rounded 1e-10 between phases)
│   0 unlimited   first row unlimited → infinite sink, done
│   1 rollovers   oldest-expiring first, floor 0            (skip on refund)
│   2 pass 1      every row, floor 0            (refund: ceiling 0)
│   3 pass 2      rows with usageAllowed only (refund: every row)
│                 floor = spend-limit headroom | minBalance | none
│                 (refund: ceiling maxBalance + adjustment)
│   every row     usage-window headroom gate, then consume it
│   every row     3 entity cases: target entity · all entities · top-level
│
├ decide  remaining > 0 and reject → INSUFFICIENT_BALANCE, no writes
│         else applied = V − remaining (cap drops the rest)
│
└ writes  customer_entitlements { balance, adjustment, entities,
          usage_attribution } · rollovers { balance, usage, entities } ·
          usage_windows counters · _aggregated · lock receipt
```

Out of the track path but on the same core: `target_balance` / `alter_granted_balance`
(set usage, adjust), lock `unwind` (finalize), `event_name` → N features → N Lua calls.

### the precedent
[server/src/internal/billing/v2/actions/attach/ · catalogV2/actions/updateCatalog/]

```
attach.ts   setup → log → compute → errors(plan) → evaluate → errors(full) → execute
            setup/   one builder per fact → AttachBillingContext extends BillingContext
            compute/ one planner per facet → one AutumnBillingPlan literal → finalize passes
            errors/  one rule per file, two barrels, always after compute
```

catalogV2 is the cleaner model for a pure engine: no Stripe phase, `types/` beside the
action, and compute is a fold with a `projected` state because later steps depend on
earlier ones. Deduction passes have exactly that dependency (pass 2 reads what pass 1 and
the rollovers left), so the deduction core is a fold, not a literal.

### the spec
[server/tests/integration/balances/{track,check,usage-windows,lock}/]

Engine tests cover the write machinery and cap/reject/overflow on one row. None of:
multi-row order, unlimited, credit systems, rollovers, entities, windows, spend limits,
refunds, locks. Every unit below names the integration files that become its spec.

## Target model

### One protocol for every command

```
Command ─setup─▶ Context ─compute─▶ Outcome ─▶ Mutation ─validate─▶ Decision
 wire, zod       rows + policy      deltas     changes +           new | duplicate
                 pure, derived                 result              | unsupported
```

There is one core: a **deduction**. Every command that moves balance is the deduction
plus a wrapper: track commits it, check dry-runs it with `reject`, finalize unwinds a
receipt then runs it, adjust runs it with `alterGranted`. Decisions stay as they are:
`Decision<{ kind: "new" | "duplicate"; mutation }>` for writers, check's `{ kind:
"decided", … }` for reads.

```
packages/balance-engine/src/
├── models/        wire + log shapes, zod                       (as today)
├── deduction/     the core, below
├── commands/
│   ├── track/     track.ts · trackOutcomeToMutation.ts · validateTrackMutation.ts · types/
│   ├── check/     check.ts · types/
│   └── initialize/
├── mutation/      applyMutation · applyChanges                 execute, unchanged
└── utils/
```

```ts
// commands/track/track.ts
const unsupported = unsupportedTrackReason({ fullSubject, command });
if (unsupported) return unsupported;
const context = setupDeductionContext({ fullSubject, featureId, overageBehavior, now: command.occurredAt });
const outcome = computeDeduction({ context, value: command.value });
const mutation = trackOutcomeToMutation({ command, context, outcome, deduplicationExpiresAt });
validateTrackMutation({ mutation });
return { kind: "new", mutation };

// commands/check/check.ts
const context = setupDeductionContext({ fullSubject, featureId, overageBehavior: "reject", now });
const outcome = computeDeduction({ context, value: command.requiredBalance });
return { kind: "decided", allowed: !outcome.rejected, ...contextToBalance({ context }) };
```

Check as a dry run matches `apiBalanceToAllowed` branch for branch (unlimited → sink,
required < 0 → refund never rejects, control `false` → overage bucket skipped,
overage_allowed → overage bucket floor, windows → limit headroom). One known divergence:
`apiBalance.remaining` nets a negative overage row against a refilled included row; the
dry run answers what track would do.

### The deduction

Built in unit 0 as `deduction/`: setup decides every fact once, four buckets draw in order,
one clamp does the arithmetic, deltas are the log and fold into row changes. The tree as it
stands and as every later unit extends it is under "the folder every unit lands in" below;
this table says where each Lua nuance lives in it.

```ts
type DeductionRow     = { table; id; balance; creditCost; usageAllowed; minBalance; maxBalance; unlimited };
type DeductionContext = { featureId; entityId; now; overageBehavior; customerEntitlements; rollovers; rows; rolloverRows };
type DeductionState   = { remaining: Decimal; deltas: DeductionDelta[] };
type DeductionDelta   = { table; id; balanceDelta; usageDelta; valueDelta; creditCost };
type DeductionOutcome = { context; requestedValue; appliedValue; remaining; rejected; deltas; changes };
```

| Nuance | Lives in |
|---|---|
| cap / reject / overflow | `allowsNegative` + `deductFromBucket` row admission + the reject decision in `deduct` |
| usage_allowed, free allocated, overage_allowed control | `setup/resolveRowBounds.usageAllowed` |
| overage floor, granted ceiling on refunds | `setup/resolveRowBounds.minBalance` / `.maxBalance` |
| unlimited sink, hoist | `setup/selectDeductionRows` + the `unlimited` bucket |
| credit cost, rate cards, attribution | `setup/resolveCreditCosts` + `utils/credits/rateCard` |
| spend limit | `setup/resolveLimits` + `utils/limits/spendLimit` |
| usage windows, property filters | `setup/resolveLimits` + `utils/limits/usageWindows` |
| rollovers | `setup/selectDeductionRows` + the `rollovers` bucket |
| entity target / all entities / top-level | `utils/draw/deductFromEntities` |
| past-due block, org statuses, reverse order | `setup/selectDeductionRows`, flags on the command |
| refunds | every bucket's ceiling, one arithmetic in `clampChange` |

Adding a nuance later is a field on `DeductionRow`, a file in `utils/limits/`, or a bucket.
Never a branch in the loop.

## The record contract

```
MutationRecord
├── id · identity · revision · receipt     the log's own bookkeeping        fixed forever, strict
├── changes: RowChange[]                   the state, what replay applies   fixed forever, strict
└── command · result                       why, and what happened           free, loose
```

`changes` is the only field that touches `SubjectState`, through row schemas that are picks of
the shared DB rows. Replay, checkpoint restore and the follower read nothing else. `command`
is the request as the log remembers it; `result` is what the command decided
(`TrackResult { type, status, reason, deltas }`, `InitializeResult { type }`). Both parse loose
so a newer worker can add a field without a version bump and an older one replays it. A
`result` never carries a state-shaped object.

## Command protocol

```
engine  commands/<x>/
        compute<X>.ts        (subject, Command) → SubjectStateMutation   writers
                             (subject, Command) → XResult                readers
        types/               <x>Command.ts · <x>Result.ts

client  contracts/<x>.ts     <X>Request { route, command, payload? } · <X>Reply

engine ──▶ log                                   worker ──▶ server
SubjectStateMutation { …, result: XResult }      XReply { result: XResult, …, state }
```

No `kind` unions, no `duplicate` on track (a retry replies what the first call replied).
Unsupported is an error: the engine throws `UnsupportedCommandError({ reason })`, the worker
maps it to 400 `UNSUPPORTED_COMMAND`, the client to `workerReason`, the server to
`BalanceWorkerUnsupportedError`. Dedup (fingerprint, receipt, expiry) is the writer's.

## Reply contract

### the decision: worker speaks rows, server speaks API

Two candidates were weighed for what the worker returns:

- **A · API-shaped.** The worker returns `TrackResponseV3` / `CheckResponseV3` and the server
  forwards it.
- **B · worker-schema.** The worker returns its rows and what it did; the server translates to
  the API, as it does for the Redis path today.

B, for three reasons that do not move:

1. **It is the existing architecture.** Lua returns row updates and mutation logs
   (`DeductionUpdate`, `MutationLogItem`); `runRedisTrackV3` builds the API response, the event,
   the webhooks. The worker replaces Lua, not the server.
2. **API shaping needs what only the server has.** `applyResponseVersionChanges` needs
   `ctx.apiVersion`; `getApiBalance` needs `FullCusEntWithFullCusProduct` with prices for the
   breakdown, `ctx.features` for linked credit systems, org config for deduction order, and
   products for `preview`. The worker's catalog is entitlements, products and features only.
3. **The reply is archived.** Replay stores the worker's decision. A stable row-shaped reply
   survives API version churn; an API-shaped one would archive whatever version was current.

### what a track reply must let the server do

Everything `runRedisTrackV3` does after a deduction, so the worker path can do the same:

| consumer | needs | from |
|---|---|---|
| API `balance` / `balances` (linked credit systems) | rows after + catalog | `state` |
| API `deductions[]` (balance_id, feature, plan, reset, value) | which rows moved, by how much | `result.deltas` |
| `InsufficientBalanceError` | verdict, value, balance before | `result.status`, `command.value`, `state` |
| event row + `credit_cost` property, `internalProductId` | per-row value in feature units, credit cost | `result.deltas` |
| webhooks: thresholds, usage alerts, limit reached | rows **before** and after, affected features | `changes` + `state` |
| auto top-up | rows after, feature | `state` |
| PG sync (dirty cus_ent / rollover ids, usage windows) | which rows moved | `changes` |
| shadow | revision, remaining, applied | `state`, `result.deltas` |
| replay archive | the decision itself | the whole reply |

### the shape

```
TrackReply {
  result:  TrackResult            what it decided       logged, loose
  changes: RowChange[]            what moved, per row   logged, strict, replayed
  state:   SubjectState           the rows after        reply only
}
CheckReply       { result: CheckResult, state }
InitializeReply  { result: { status, duplicate }, state }
```

- **`result` + `changes` are the mutation's two halves, verbatim.** Nothing on the reply is
  assembled or derived by the worker; it lifts both off the committed record and adds `state`.
- **Rows before are derived, not shipped.** `revertChanges({ state, changes })` in the engine
  mirrors `applyChanges`; the server gets the pre-track rows for webhooks and alerts without a
  second full state on the wire. Only touched rows differ, so shipping `stateBefore` would
  duplicate every untouched row.
- **`deltas` stays inside `result`** because it says what `changes` cannot: value in the tracked
  feature's units and credit cost, which the event needs. `changes` says what `deltas` cannot:
  every column that moved, which sync and future fields (usage windows, spend counters) need.
- **A retry replies the stored record's two halves plus the rows as they stand now.**
- **Future commands add fields, not envelopes.** Check with lock adds `lock` to `CheckReply`;
  finalize gets its own `FinalizeReply`. `state` is one field a command chooses to return, not
  a transport envelope.

### the server side, mirrored on the Redis path

`server/src/internal/balances/track/balanceWorker/` reads as `runRedisTrackV3` does, one named
step per line, reusing the same downstream helpers:

```
runBalanceWorkerTrack
  command     = trackParamsToTrackCommand({ ctx, body })
  reply       = client.track({ command })
  fullSubject = loadBalanceWorkerSubject(...)
  { before, after } = trackReplyToFullSubjects({ fullSubject, reply })      overlay rows
  deductions  = trackReplyToDeductions({ reply, after })                    TrackDeduction[]
  queueSyncItem · queueEvent · fireTrackWebhooks · triggerAutoTopUp         existing helpers
  return trackReplyToApiResponse({ ctx, command, reply, after, deductions })
```

`workerStateToApiBalance` becomes a step inside `trackReplyToFullSubjects` + `getApiBalance`;
check follows the same two steps without the side effects.

**Open: PG sync.** Whether the server path queues `SyncBatchingManagerV3` items for worker
tracks, or a Kafka consumer of the mutation log owns PG sync, decides whether `queueSyncItem`
appears above. Decide before 5b.

## Parity with the Lua deduction

"Complete" means: a track through the worker decides exactly what `deductFromSubjectBalances.lua`
decides, for a subject initialized from a clean state. Out of scope, by decision: allocated
invoices, webhooks and alerts, auto top-up, locks and finalize, PG sync, `target_balance` /
`alter_granted_balance` (a future `adjust` command), `event_name` fan-out (the server sends N
commands). Everything else in the scripts has a row below.

| Lua capability | engine today | unit |
|---|---|---|
| row selection: `fundsFeatureId`, `sortCusEntsForDeduction`, `inStatuses`, `reverse_deduction_order` | `featureIds` only, default order | 5b (statuses, order) · 8 (`fundsFeatureId`) |
| unlimited sink hoisted first, no clamps either way | ✓ | — |
| rollovers first, soonest-expiring, floor 0, never on refund | ✓ | — |
| pass 1 floor 0 · refund ceiling 0 | ✓ | — |
| pass 2 `usage_allowed`, floor `-maxOverage`, refund ceiling starting balance + adjustment | floor from `usage_limit - allowance`, ceiling `allowance` | 5b: `getMaxOverage`, `cusEntToStartingBalance`, adjustment |
| prepaid grants in the starting balance | refused (`balance_shape_not_supported`) | 5b |
| `cap` / `reject` / `overflow` semantics | ✓ | — |
| rounding 1e-10 between phases | Decimal | — |
| spend limit gate in pass 2: `fullSubjectToSpendLimitByFeatureId` + usage-based row ids → `available_overage` | ✗ | 6 |
| overage-allowed controls (customer / product `overage_allowed`) flip `usage_allowed` | ✗ | 6 |
| free allocated rows usage-allowed unless `reject` | ✗ | 6 |
| overdue block: past-due threshold-billing products dropped (`getCheckSubject`) | ✗ | 6 (needs org config: see decision 9) |
| usage windows: limits from entitlement config, metered vs balance dims, per-row gate, consume, counters with lazy roll, property filters | ✗ | 7 |
| event `properties` (window filters, credit dimension rules) | refused | 7 · 8 |
| credit systems: `entitlementToCreditSystem` (+ `feature_override`), `getCreditCost`, graduated rate cards, `usage_attribution`, tokens cost | `creditCost: 1` | 8 |
| credit-system rows sort last; `getCreditRateRequiredBalance` for check | ✗ | 8 |
| entities: target / all / top-level cases, per-entity adjustment, entity-first sort, per-entity rollovers | ✓ | 9a |
| pooled balances (`is_pooled_balance` rows) | refused | 9 |
| boolean and continuous-use features | refused | 9 (boolean → check `flag`) |
| mutation logs → per-row deltas with value and credit cost | ✓ (`usage_attribution_delta` in 8) | — |
| idempotency, subject view epoch | writer receipt, log revision | — |
| `_aggregated` cache field | n/a: state is rows | — |

The server gates in `fullSubjectToSubjectState` are the inverse of this table; each unit
deletes the refusals it makes obsolete and points the matching integration specs at the worker.

### the folder every unit lands in

Every parity unit is an expansion of the same shape, never a new path. Setup decides facts
once (one builder per fact, as attach's `setup/` does); the buckets never read the subject;
limits are gates the draw consults before it clamps and settles after. Files land where the
tree says, and a unit that needs a new folder is a unit whose design should be re-checked.

```
commands/track/
├── computeTrack.ts                     assert → deduct → trackOutcomeToMutation
├── trackCommandToDeductionRequest.ts   what the command asks the deduction for
├── trackOutcomeToMutation.ts
└── types/  trackCommand · trackResult

deduction/
├── deduct.ts                           ({ fullSubject, request }) setup → unlimited · rollovers · included · overage → decide
├── setup/
│   ├── setupDeductionContext.ts        composes the builders below into DeductionContext
│   ├── selectDeductionRows.ts          which rows fund the feature, in draw order      5b · 8 · 9
│   ├── resolveRowBounds.ts             usageAllowed · minBalance · maxBalance per row   5b · 6
│   ├── resolveCreditCosts.ts           creditCost · rateCard per row and rollover       8
│   ├── resolveBillingControls.ts       spend limits and overage_allowed, via shared     6
│   └── resolveUsageWindowLimits.ts     the caps this request must respect, via shared   7
├── utils/
│   ├── classifyDeductionUtils.ts       isRefund · allowsNegative
│   ├── convertDeductionUtils.ts        deductionRowToCurrentBalance · deductionRowToRateUnits · deltasToRowChanges
│   ├── draw/
│   │   ├── deductFromBucket.ts         which rows a bucket visits
│   │   ├── deductFromRows.ts           one pass: gate → clamp → delta → settle
│   │   ├── deductFromEntities.ts       target · all · top-level cases for one row       9
│   │   └── clampChange.ts
│   ├── limits/
│   │   ├── spendLimit.ts               deductionRowToSpendLimitHeadroom                 6
│   │   └── usageWindows.ts             deductionRowToUsageWindowHeadroom · consume       7
│   └── credits/
│       └── creditRateUnitsForCreditChange.ts   credits → units across tiers; cost is shared `creditRateToCost`   8
└── types/
    deductionRequest · deductionContext · deductionRow · deductionState · deductionDelta · deductionOutcome
```

Setup reads the subject through `@autumn/shared` only: `fullSubjectToCustomerEntitlements`,
`fullSubjectToSpendLimitByFeatureId`, `fullSubjectToOverageAllowedByFeatureId`,
`fullSubjectToUsageWindowLimits`, `cusEntToStartingBalance`, `getMaxOverage`,
`isUnlimitedCustomerEntitlement`, `isAllocatedCustomerEntitlement`, `isThresholdBillingCustomerProduct`.
Those helpers take view types (`CustomerEntitlementRowView`, `CustomerProductWithPricesView`,
`BillingControlSubjectView`) that both `FullSubject` and the worker's rows satisfy, so the server
and the engine run one implementation. The engine keeps no re-implementation of a shared rule.

Where each parity feature attaches:

- **Row facts** (`usageAllowed`, bounds, credit cost) are decided in `setup/` and stored on
  `DeductionRow`. The draw reads the row, never the subject or the org.
- **Gates** (`utils/limits/`) expose two calls the draw uses in order: `headroomOf({ row, remaining })`
  caps the amount before `clampChange`; `consume({ row, change })` settles after. Spend limits
  and usage windows are two implementations of one `DeductionLimit` type, held on the context.
- **Credits** (`utils/credits/`) are pure math the draw and the rollover pass call through the row's
  `rateCard`; `creditCost` stays the constant-rate fast path.
- **Entities** (`deductFromEntities`) sit under the draw: a row with entity scope fans one
  clamp into per-entity clamps and per-entity deltas; the bucket loop does not know.
- **Org settings** the Lua path reads from `ctx.org` arrive as `command.org` (decision 9), so
  setup stays a pure function of `(subject, command)`.

## Units

### 0 · [x] engine → `deduction/` folder, track and check on it
### 1 · [x] worker → dedup out of the engine
### 2 · [x] engine → `models/` hierarchy
### 3 · [x] engine + worker + client + server → the record contract
### 4 · [x] engine + worker + client + server → command replies

(0–4 as recorded in the previous revision; the reply now ends as `TrackReply { result, state }`
with `TrackResult { type, status, reason, deltas }`, `CheckReply`, `InitializeReply` in the
client's contracts.)

### 5a · [x] engine + client + worker + server → `changes` on the track reply

- Engine: `revertChanges({ state, changes })` beside `applyChanges`, tested as its inverse.
- Client: `TrackReply { result, changes, state }`; worker `track()` lifts both halves off the
  committed record. Replay and shadow types follow.
- Server: `trackReplyToDeductions` builds `TrackDeduction[]` from `result.deltas` and the server
  catalog; `trackReplyToApiResponse` fills `deductions`. The before/after overlay
  (`trackReplyToFullSubjects`) waits for the first side effect that reads rows-before (unit 10).
**verify** — `revertChanges` inverse tests (track update, entity insert, stale rows, delete) ·
`balance-worker-track.test.ts` asserts `deductions[]` for full and capped tracks

### 5b · [x] engine + server → plain metering at parity, gates lifted

- Engine: `setup/selectDeductionRows` (statuses from `command.org`, `reverse_deduction_order`,
  unlimited hoisted, rollovers by expiry) and `setup/resolveRowBounds` (overage floor
  `usage_limit − grant` where usage is allowed; refund ceiling grant + adjustment).
  `commandOrg` pick on `TrackCommand` / `CheckCommand`: `reverse_deduction_order`,
  `block_overdue_entitlements`, `include_past_due`, nothing else.
- Server: `orgToCommandOrg` on both command builders; replay plans with the org's live config.
  Lifted: `multiple_customer_entitlements`, `unlimited`, `overage`, `usage_limit`, `rollover`,
  `past_due`, `additional_balance`, `negative_balance`.
**verify** — engine tests: adjustment ceiling, usage_limit floor, reverse order, past-due statuses ·
integration specs below await the DB

### 5c · [x] engine + worker + postgres + server → prices

Prepaid grants and priced entitlements need the row's price: `cusEntToStartingBalance` reads the
customer price's billing units and the product options' quantity.
- State: `customerPrices: WorkerCustomerPrice[]` on `SubjectState`; catalog table `prices`.
  Postgres `getSubjectRows` returns `customer_prices`; `fullSubjectToCatalogRows` emits price rows.
- Engine: `resolveRowBounds` ceiling becomes `cusEntToStartingBalance + adjustment`.
- Server: lifted `balance_shape_not_supported` (prepaid grants) and `priced_entitlement_not_supported`.
**verify** — engine tests: prepaid ceiling (grant + quantity × billing units), product quantity on an
unpriced grant · postgres SQL param test · worker catalog cache and hydration tests
**spec (awaits DB)** — `track/basic/*` (expiry order, negative, basic5), `track/rollover/*`,
`track-max-purchase`, `check/check-basic`, `check/check-prepaid`, `check/check-balance-price`

### 6 · [x] engine + server → billing controls

- Rows: `WorkerCustomer` carries `spend_limits` and `overage_allowed`; `WorkerCustomerProduct`
  carries the plan window (`starts_at`, `access_starts_at`, `ended_at`, `customer_license_link_id`).
- Engine: `setup/resolveBillingControls` resolves one spend limit (absolute, percentage against the
  main plans' grant) and one overage control per feature through the shared `resolveBillingControl`,
  now generic over the product row; `resolveRowBounds` decides `usageAllowed` from the row, a free
  allocated grant, and the control; `utils/limits/spendLimit` gives the overage bucket its headroom
  in place of the row's floor; `selectDeductionRows` drops past-due products the way `getCheckSubject`
  does (checks honour `org.block_overdue_entitlements`, tracks only threshold billing) and a blocked
  feature with no rows left is refused, not unsupported.
- Server: the customer/product control gate shrinks to `usage_windows_not_supported`.
**verify** — engine tests: customer control enables overage, plan control vetoes native overage,
spend limit across two rows and under reject, percentage limit, overdue block on check vs track
**spec (awaits DB)** — `track/spend-limit/*`, `track/overage-allowed/*`, `track/overage-overflow/*`,
`check/spend-limit/*`, `check/overage-allowed/*`, `check-overdue-entitlements`, `check-overdue-plan-scope`

### 7 · [x] engine + worker + server → usage windows

- State: `usageWindows: WorkerUsageWindow[]` (the whole `usage_windows` row) on `SubjectState`,
  insert/update `RowChange`s; postgres and the server initialize carry the customer-scoped rows;
  `WorkerCustomer` gains `usage_limits`, `WorkerCustomerProduct` the billing-cycle anchor.
- Engine: `setup/resolveUsageWindowLimits` mirrors `fullSubjectToUsageWindowLimits` on the worker's
  rows through the shared pure pieces (bounds, dimension, key, anchor pick, filter match); none when
  an unlimited row funds the track or the caller overflows. `utils/limits/usageWindows` gives the
  draw its headroom per cap (metered caps count tracked units on every row, balance caps count
  credits on the capped feature's rows; rollovers only meet metered caps), consumes as rows give,
  and re-stamps or creates the counter row (`uw_<key>`, deterministic for replay).
- Commands accept `properties`; `properties_not_supported` retired in engine and server.
- Server: the usage-window gate is gone. API `usage_limit_used` from worker counters is not derived
  yet (out of scope with the other response side effects).
**verify** — engine tests: cap across two rows onto one new counter, live vs expired counter,
filtered cap by properties, reject refuses and overflow bypasses
**spec (awaits DB)** — `usage-windows/*`

### 8 · [x] engine + shared + server → credit systems

- Shared: the pure credit math moved out of `server/src/internal/features/creditSystemUtils.ts` into
  `shared/utils/featureUtils/{creditRates,creditDimensions}/` (schema item with dimension rules,
  flat and graduated cost, rate card, funded units); the server module re-exports the same names
  and keeps only the FullSubject-typed `getCreditRateRequiredBalance`.
- Engine: `selectDeductionRows` selects by `fundsFeatureId`, so a credit system's rows fund the
  tracked feature after its own (the shared sort); `setup/resolveCreditCosts` prices each row
  (`creditCost`, and a `rateCard` when usage is attributed); cost through the tiers is the shared
  `creditRateToCost` (widened to any `CreditRate`, so a rate card and a schema item price alike) and
  the inverse, credits → units, is `utils/credits/creditRateUnitsForCreditChange`; the draw charges
  through the rate card from the units already attributed and records
  `usageAttributionDelta` on the delta; `deltasToRowChanges` folds attribution into
  `usage_attribution` on the owning row; rollovers charge at their owner's rate. Balance-dimension
  usage windows convert headroom through the rate card.
- Commands carry `internalFeatureId` (required; the server resolves it from `ctx.features`) because
  attribution keys are catalog internal ids the worker's rows cannot supply for a feature the
  customer holds only through credits.
- Server: `credit_system_not_supported` lifted; metering rows are selected by funding membership.
  Not yet: `balance`/`balances` feature selection and credit-converted `required_balance` in the
  API translation, and token-priced tracks (`getModelCreditCost`).
**verify** — engine tests: flat rate after own rows, dimensioned rate by properties, graduated tiers
with attribution across two tracks, check refused by an exhausted pool
**spec (awaits DB)** — `check-credit-dimensions*`, `check-overlapping-credit-systems`,
`check-send-event-credit-system`, `track-credit-system*`, `track-graduated-credit-system`,
`track-feature-override-*`, `check-prepaid-invoice-credits`

### 8b · [x] engine + shared + server → one implementation, shared naming

- Shared view types (`CustomerEntitlementRowView`, `CustomerProductWithPricesView`,
  `CustomerEntitlementWithPricesView`, `BillingControlSubjectView`, `PlanControlCustomerProduct`)
  widen the billing-control, starting-balance, max-overage, usage-window and classify helpers so the
  worker's rows satisfy them; the engine's local copies (`isOneOffProduct`, `mainPlanGrantOf`,
  `absoluteOverageLimitOf`, `maxOverageOf`, `startingBalanceOf`, `usageLimitToWindowLimit`,
  `anchorOf`, `isThresholdBillingProduct`, `creditRateCostAtUsage/ForUnits`) are deleted.
- `resolveBillingControl<TKey, TControl = BillingControlByKey[TKey], CP>`: the key names the control
  type, so call sites pass no type arguments.
- `deduct({ fullSubject, request })` with `DeductionRequest`; `trackCommandToDeductionRequest` /
  `checkCommandToDeductionRequest` say what each command asks for.
- featureUtils follow `/shared-utils`: `classifyFeature/isInvoiceCreditFeature`,
  `findCreditSchemaItemByFeatureId`, `creditRateToCost`; `isThresholdBillingCustomerProduct` moved to
  `cusProductUtils/classifyCustomerProduct`; new `isUnlimitedCustomerEntitlement` reads the
  `unlimited` column as well as `allowance_type` (the older `isUnlimitedCusEnt` is unchanged).
- Engine utils split `classify` / `convert`; `<src>To<dst>` names for headroom and balance reads.
**verify** — engine 75 · worker 456 · client 22 · postgres 6 green; shared, engine, worker, client,
server typecheck clean.

### 9a · [x] engine + server → per-entity balances

- Decision 13: the `entities` map stays on the row; setup explodes it into one `DeductionRow`
  per key (`entityKey` on the row and on its deltas). An entity view targets its own key; a
  customer-level track draws every key in sorted order, the Lua `sorted_keys` loop. The draw,
  clamps, buckets, spend headroom, usage windows and attribution are untouched.
- `customerEntitlementToDeductionRows` sizes each key's ceiling as the parent's grant plus the
  entity's own adjustment; `rolloverToDeductionRow` holds a balance under each key its owner does.
  `deltasToRowChanges` folds per-entity deltas into `entities` (before → after), leaving `balance`
  alone; a key first drawn or refunded into is created.
- Worker rows pick `entities` (customer entitlements, rollovers) and the entity's billing controls.
- Server: `entity_id` accepted; `validateMeteringEntitlement` keeps only `license_not_supported`;
  check commands carry the entity identity; `workerStateToApiBalance` overlays `entities`.
  Replay still refuses entity requests at plan time: cohorts are customer subjects.
**verify** — engine: target key, key-order aggregate, refund to grant plus entity adjustment,
per-entity rollover, unlimited per-entity row, entity view mixing a map row and the entity's own row
**spec (awaits DB)** — `check/per-entity/*`, `check-credit-dimensions-entities`, per-entity spend-limit suites

### 9a′ · [x] engine → parity audit against the Lua branches and the spec suites

Every branch of the Lua deduction and every in-scope integration and server-unit case was
matrixed against the engine. Fixed on the way: a zero credit rate is charged one to one and
leaves its rollovers alone (Lua fallback); an expired rollover never funds a draw; `overflow`
lifts the refund ceiling; a free graduated tier moves units and attribution with no balance
change; `overflow` skips the window gate but the counters still record the draw. Tests split by
domain under `tests/unit/deduction/` (core, rollovers, billing controls, usage windows, credits,
entities) on a shared `deductionFixtures.ts`.
Intentional divergences from Lua, each safer than the original: rollovers take entity scope from
their own owner, not the first row; a zero-rate owner skips only its own rollovers, not the
whole phase; no rounding step, since Decimal arithmetic is exact where Lua rounds to 10 places.

### 9b · [ ] engine + server → pooled balances
### 9c · [ ] engine + server → boolean features answer check with `flag`

### 10 · [ ] deferred → locks and finalize, allocated invoices, webhooks, auto top-up, PG sync

Explicitly not part of "complete". Locks and finalize are the next command after parity;
the rest are server side effects fed from `changes` + `state` (see the reply table above).

## Decisions

1. **One core.** Check is a reject-mode dry run of the deduction. Finalize and adjust are
   wrappers on the same core. 2026-09-17.
2. **Buckets are named, not looped over.** `deductFromBucket({ bucket })` four times in `deduct`;
   `bucketToRows` says who a bucket visits, `boundsOf` how far they move.
3. **Nuances are row facts or limits.** Per-row facts go on `DeductionRow` in setup; shared caps
   implement `DeductionLimit` under `utils/limits/`. No branches in the loop.
4. **No ledger.** State is `deltas[]`; projected balance is derived.
5. **Deterministic engine.** `now` is on the command; no clock reads.
6. **Names.** `DeductionContext`, `DeductionRow`, `DeductionState`, `DeductionBucket`,
   `DeductionLimit`, `DeductionDelta`, `DeductionOutcome`. Setup steps `select*` / `resolve*`;
   conversions `<src>To<dst>`; predicates `is*`. Plain words: no slot, echo, funding, ledger.
7. **Worker speaks rows, server speaks API.** The reply is the mutation's `result` and
   `changes` plus `state`; API shaping, versioning and side effects stay on the server, where
   they already live for the Redis path. 2026-09-17.
8. **Replies are per command, not an envelope.** `<X>Reply` lives in the client's contracts;
   `state` is a field a command returns, not a wrapper every command must fit.
9. **Org context comes from the server, on the command, and only what is read.** The Lua path
   reads `ctx.org` for `reverse_deduction_order`, `block_overdue_entitlements` and the statuses
   `orgToInStatuses` derives; those travel as an `org` pick on `TrackCommand` / `CheckCommand` (decision 12),
   nothing more, so the log records the settings a decision was made under and replay stays
   exact. Features are already catalog rows. Keep what crosses to the worker minimal: a field
   is added when a unit reads it, never ahead of time. 2026-09-17.
10. **Shared rules are typed by what they read.** A shared helper takes the narrowest view of a
   row it needs (`Pick`/view types), never `FullCusProduct`, so the server's full rows and the
   worker's lean rows share one implementation; the engine adds a local rule only when no shared
   one exists, and then asks first. 2026-09-17.
11. **Commands carry data, contexts carry handles; the two never merge.** Everything a decision
   reads (identity, org settings, features, `occurredAt`) is on the command, because a replay must
   reach the same decision without a live server. Everything that executes (logger, clock, hydrator,
   writer, database) lives in the process running it: `AutumnContext` on the server,
   `PartitionProcessorScope.ctx` in the worker, nothing in the engine. No context object crosses
   the client, and the worker never fetches org context itself. 2026-09-18.
12. **`org` is a field on the commands that read it.** Track and check declare `org`; initialize
   loads a baseline, decides nothing, and carries none, so the worker's own hydration can build one
   without fetching org context. The server converters share `requestContextToCommandBase` for the
   base fields and add `org` with `orgToCommandOrg`; the client stays a transport. 2026-09-18.
13. **Per-entity balances are rows, not a draw type.** The `entities` map stays on the stored row
   because `SubjectState` rows mirror Postgres rows and a `RowChange` is one row's before/after.
   Setup explodes the map into one `DeductionRow` per key, so target, aggregate and top-level are
   row selection and the draw never learns entities exist. 2026-09-18.
14. **The log declares how a row moves: `increment` or `update`.** A deduction logs
   `increment` changes, `{ add, addEntries, guard? }`, for balances, adjustments, rollover usage,
   per-entity balances and attribution counters; the applier adds them to whatever the row holds
   and the committer renders `col = col + $d`, so a reset or grant that landed between decide and
   commit is kept and the usage comes off it. A change that re-shapes a row (a window roll, a
   reset) logs `update` with `before`/`after` and commits as a guarded set. A live window consume
   is an increment guarded by its bounds, so a concurrent roll refuses it instead of double
   counting. Nothing is inferred at the commit boundary; the producer says what it meant.
   Known bound: adds keep Postgres correct, not a stale decision; a clamp near a boundary can
   under-charge until the worker re-reads. 2026-09-18.
