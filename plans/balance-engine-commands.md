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

Take `value` units of feature F from the subject in a fixed order of **buckets**, each
row bounded by its **policy** (decided once, per row) and by shared **limits** (read
before a row, consumed after). State is only the list of **deltas**; a projected balance
is original − Σ deltas.

```
value 30 on F      rows sorted: [unlimited?] [rollovers] [included…] [overage…]
                   ┌──────────┬───────────┬──────────────┬──────────────────┐
bucket             │unlimited │ rollovers │ included     │ overage          │
floor              │ none     │ 0         │ 0            │ limit headroom   │
                   │          │           │              │ | minBalance     │
                   │          │           │              │ | none if allow  │
who                │ 1st row  │ all, old  │ every row    │ usageAllowed rows│
                   │ if unlim │ first     │ in order     │ in order         │
refund (value<0)   │ none     │ skipped   │ ceiling 0    │ ceiling granted  │
                   └──────────┴───────────┴──────────────┴──────────────────┘
remaining after buckets > 0  →  cap: drop it · reject: nothing written
```

```
deduction/
├── setupDeductionContext.ts     subject → context     (orchestrates setup/)
├── computeDeduction.ts          context + value → outcome  (folds buckets/)
├── setup/                       decided ONCE per command
│   ├── selectDeductionRows.ts   shared selector + sort, past-due block, unlimited hoist
│   ├── selectRollovers.ts       every row's rollovers, expires_at asc
│   ├── resolveRowPolicy.ts      usageAllowed · minBalance · maxBalance · unlimited
│   ├── resolveCreditCost.ts     creditCost · rateCard per row                (unit 4)
│   ├── resolveBillingControls.ts overageAllowed · spendLimit · window limits  (unit 2)
│   └── overageBehaviorToPolicy.ts allowsNegative · enforcesSpendLimit · rejectsShortfall
├── buckets/                     the ORDER value is taken; a bucket is data, not a loop
│   ├── runBucket.ts             rows → limits headroom → slots → deductFromSlot → consume
│   ├── deductFromSlot.ts        the one arithmetic: clamp to floor / ceiling → delta
│   ├── unlimitedBucket.ts · rolloversBucket.ts · includedBucket.ts · overageBucket.ts
├── limits/                      shared caps: { headroomFor({ row, deltas }), consume({ row, units }) }
│   ├── spendLimit.ts            headroom = overage_limit − current overage    (unit 2)
│   └── usageWindows.ts          headroom per window, counter deltas          (unit 3)
├── utils/
│   ├── convertDeductionUtils.ts deductionRowToSlots · projectedBalanceOf · deltasToRowChanges
│   └── classifyDeductionUtils.ts isUnlimitedDeductionRow · isRefund
└── types/   deductionContext · deductionRow · rowPolicy · overagePolicy · deductionBucket
             deductionLimit · deductionDelta · deductionOutcome
```

```ts
type RowPolicy        = { usageAllowed; minBalance: number | null; maxBalance: number | null; unlimited };
type DeductionRow     = { customerEntitlement; creditCost; policy: RowPolicy };
type DeductionContext = { featureId; entityId; now; policy: OveragePolicy; rows; rollovers; limits };
type DeductionBucket  = { name; rowsOf({ context }); floorOf({ row, context }); ceilingOf({ row }); limits };
type DeductionDelta   = { table; id; entityId; balanceDelta; adjustmentDelta; usageDelta; valueDelta; creditCost };
type DeductionOutcome = { appliedValue; remaining; rejected; deltas; changes: RowChange[] };
```

`DeductionDelta` is Lua's `mutation_logs` entry: what a lock receipt stores and what the
track response's `deductions[]` reads. Adding a nuance later is a field on `RowPolicy`, a
file in `limits/`, or a bucket. Never a branch in the loop.

| Nuance | Lives in |
|---|---|
| cap / reject / overflow | `overageBehaviorToPolicy` → buckets + the reject decision |
| usage_allowed, free allocated, overage_allowed control | `resolveRowPolicy.usageAllowed` |
| max_purchase | `resolveRowPolicy.minBalance` |
| granted ceiling on refunds | `resolveRowPolicy.maxBalance` |
| unlimited sink, hoist, window bypass | `selectDeductionRows` + `unlimitedBucket` |
| credit cost, rate cards, attribution | `resolveCreditCost` + `deductFromSlot` |
| spend limit, percentage, most-restrictive | `resolveBillingControls` + `limits/spendLimit` |
| usage windows, property filters, entity carve-out | `resolveBillingControls` + `limits/usageWindows` |
| rollovers | `selectRollovers` + `rolloversBucket` |
| entity target / all entities / top-level | `deductionRowToSlots` |
| past-due block, org statuses, reverse order | `selectDeductionRows` |
| refunds | every bucket's `ceilingOf`, one arithmetic in `deductFromSlot` |

## The record contract

```
MutationRecord
├── id · identity · revision · receipt     the log's own bookkeeping        fixed forever, strict
├── changes: RowChange[]                   the state, what replay applies   fixed forever, strict
└── command · result                       why, and what the reply says     free, loose
```

`changes` is the only field that touches `SubjectState`, through row schemas that are picks of
the shared DB rows. Replay, checkpoint restore and the follower read nothing else. `command`
is the request as the log remembers it (params plus trace, minus envelope and bulk payload);
`result` is what the command says about what it did and is the reply payload. Both parse
loose so a newer worker can add a field without a version bump and an older one replays it.
A `result` never carries a state-shaped object: track reports `{ customerEntitlementId,
balanceAfter }`, not the row.

## Command protocol

```
commands/<x>/
├── compute<X>.ts        (subject, Command) → SubjectStateMutation   writers
│                        (subject, Command) → Result                 readers
└── types/               <x>Command.ts · <x>Result.ts               nothing else

engine ──▶ log                                   worker ──▶ server
SubjectStateMutation { …, result: XResult }      { result: XResult, revision, duplicate }   writers
XResult                                          XResult                                    readers
```

No `kind` unions. `duplicate` is a boolean the writer sets from its receipt. Unsupported is
an error: the engine throws `UnsupportedCommandError({ reason })`, the worker's error
handler maps it to a status, the server's `requireSupportedDecision` goes away. Dedup
(fingerprint, receipt, expiry) is the writer's: `processor/writer/receipt/`.

## Units

### 0 · [x] engine → `deduction/` folder, track and check on it

`deduct` = setup → 4 buckets → decide; `commands/track` and `commands/check` are wrappers.
Engine 52 · worker 456 · kafka 96 · server typecheck clean.

### 1 · [x] worker → dedup out of the engine

`SubjectStateMutation` (engine) vs `MutationRecord` (log, store, checkpoint = mutation +
receipt); `commandToFingerprint` and `mutationToRecord` under `processor/writer/receipt/`;
`MutationSubmission = { command, mutate }`.

### 2 · [x] engine → `models/` hierarchy

Pure move: `common/`, `identity/`, `subject/{rows/,subjectState,workerFullSubject}`,
`catalog/`, `mutation/{rowChange,subjectStateMutation,mutationRecord}`, `command/`.

### 3 · [x] engine + worker + client + server → the record contract

- The log's `command` is the command as sent (`TrackCommand | InitializeCommand`, parsed
  loose); the echo types are gone. Initialize's rows moved out of its command:
  `InitializeRequest = { command, state, catalogRows }`, posted as envelope
  `{ route, command, payload: { state, catalogRows } }` so routing keeps reading
  `command.identity`. `computeInitialize({ command, state })`.
- `customer` and `entity` are insert-only row changes, so an initialize record is entirely
  `changes` and `applyMutation` needs nothing from `command`.
- `TrackResult` parses loose and carries `customerEntitlementId` + `deltas` instead of the
  row; the server overlays `balanceAfter` onto its own row by id.
- Writer dedup: `MutationSubmission.baseline` carries the initialize rows so a same-id
  initialize with a different baseline still conflicts.
- Not done from the original list: `InitializeResult.status` and `CheckResult` (they are the
  reply shapes, so they move to unit 4).

### 4 · [x] engine + worker + client + server → command replies

- Engine: `computeTrack` returns the mutation, `computeCheck` returns `CheckResult
  { allowed, reason, balance, requiredBalance }`, both throw `UnsupportedCommandError({ reason })`;
  every `*Decision` type and `decision.ts` gone.
- The engine's command folder owns `TrackCommand` in and `TrackResult` logged; the client's
  `contracts/track.ts` owns `TrackReply` out, since the worker, not the engine, pairs result and state. The log record is `SubjectStateMutation { envelope, command, changes, result }`: `changes`
  is the strict, replayed half; `result` is the loose half next to it (`{ type, status, reason,
  deltas }` for track, `{ type }` for initialize). `TrackReply = { result, state }`: the result
  lifted off the committed mutation, and the subject's rows once it is committed. The worker
  assembles nothing else.
- `state` is the rows with this command's mutation applied. The writer carries it on
  `CommittedMutation.state` (the pending `nextState` for a new write, the rows as they stand now
  for a retry). `CheckReply = { result: CheckResult { allowed, reason, requiredBalance }, state }` and
  `InitializeReply = { result: { status, duplicate }, state }` sit beside it in the client's contracts.
  Server translation lives in `workerStateToApiBalance`: overlay the worker rows' balance,
  adjustment and rollovers onto the server FullSubject, then `getApiBalance`; `trackReplyToApiResponse`
  reads `command.value`, `result.status` and that balance.
- Worker maps `UnsupportedCommandError` to 400 `UNSUPPORTED_COMMAND` with `reason`; the
  client surfaces it as `workerReason`; the server's `requireSupportedDecision` is gone and
  `rethrowBalanceWorkerError` maps it to `BalanceWorkerUnsupportedError`.
- Replay's archive stores `CheckReply | BalanceWorkerTrackResponse`; an
  unsupported command is a `refused` outcome caught from the client error. Shadow summarizes
  `{ revision, status, remaining, appliedValue }` and compares worker rows to redis rows.

**verify** — engine 51, worker unit 456, client 22, kafka 96 (2 need a broker) all green;
server balance-worker suites typecheck but could not run here (worktree Neon auth), John runs them.

### 5 · [ ] server → lift gates, integration through the worker

**lifts** — `refund_not_supported`, `multiple_customer_entitlements_not_supported`,
`unlimited_not_supported`, `overage_not_supported`, `negative_balance_not_supported`,
`rollover_not_supported`
**spec** — `track/basic/track-expiry-order`, `track-negative`, `track-tokens-limits` (lim-1..4),
`track-basic` (basic5), `track/rollover/*`, `check/check-basic` (multiple balances, unlimited)

### 6 · [ ] engine → billing controls: `limits/spendLimit`, overage_allowed, max_purchase
### 7 · [ ] engine + worker → `limits/usageWindows`
### 8 · [ ] engine → credit systems
### 9 · [ ] engine → entity-scoped rows
### 10 · [ ] engine → locks: check with lock, finalize

(Steps for 6–10 as in the previous revision of this plan; unchanged.)

## Decisions

1. **One core.** Check is a reject-mode dry run of the deduction. Finalize and adjust are
   wrappers on the same core. 2026-09-17.
2. **Buckets are data.** `rowsOf` / `floorOf` / `ceilingOf` / `limits`; one loop in `runBucket`.
3. **Nuances are policy or limits.** Per-row facts go on `RowPolicy`; shared caps implement
   `DeductionLimit`. No branches in the loop.
4. **No ledger.** State is `deltas[]`; projected balance is derived.
5. **Deterministic engine.** `now` is on the command; no clock reads.
6. **Names.** `DeductionContext`, `DeductionRow`, `RowPolicy`, `OveragePolicy`,
   `DeductionBucket`, `DeductionLimit`, `DeductionDelta`, `DeductionOutcome`.
   Setup steps `select*` / `resolve*`; conversions `<src>To<dst>`; predicates `is*`.
