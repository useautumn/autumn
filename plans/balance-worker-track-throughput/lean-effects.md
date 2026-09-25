---
author: john + claude
feature: balance-worker-track-throughput / lean effects
date: 2026-09-25
status: plan — units drafted, none started
parent: overview.md (phase 1, "webhook effects: 2 extra full deductions")
---

# Effects decided from the deduction, not from a second subject

Goal: a track's effects (limit reached, usage alerts, auto top-up) cost a few µs, not ~80µs,
with byte-identical output. No fast path + fallback: one exact path that reads what the
track already computed.

## Today

```
decideTrack
├ readSubject(before)          join + catalog read
├ computeTrack → deduct        outcome discarded, only the mutation kept
├ applyMutation
├ readSubject(after)           join + catalog read, exists only for effects
└ decideEffects({ mutation, before, after })
  ├ mutationToAffectedFeatures    scans + sorts the whole subject         ~10µs
  ├ checkLimitReached             computeCheck(before), computeCheck(after)
  │                               = 2 full setupDeductionContext + draws   ~20µs
  ├ checkUsageAlerts              feature scan + scope resolve before
  │                               asking whether any alert is configured   ~4µs (69µs with alerts)
  └ decideAutoTopupEffects        row scan + sort before the config check  ~4µs
```

The deduction the track ran already holds everything the effects re-derive:

| effect needs | where the outcome already has it |
|---|---|
| which features moved | `deltas[].id` → `context.rows[].featureId`; `Feature` on `context.customerEntitlements[].entitlement.feature` |
| balance before / after per row | `context.rows[].balance` / `+ Σ balanceDelta` |
| usage windows before / after | `context.usageWindows` / `+ usageWindowConsumed` |
| "would a check now refuse?" | a draw on top of the deltas — the engine does exactly this in `computeFinalize` (`deductionState.deltas = unwound.deltas`) |

## The unit

**A check right after a mutation is a continuation of a deduction, not a replay on a rebuilt
subject.** The engine sets the check's context up once from `before` and draws twice: from
stored balances, and from stored balances plus the mutation's deltas. Everything effects read
comes from `{ mutation, outcome, before }`; `after` is never built.

This is the same shape for track and finalize (both feed `decideEffects`), and future effects
(threshold billing, entity-scope alerts) become more readers of the same outcome, not a new path.

## Units

### 1 · Benchmark the pieces

`apps/balance-worker/tests/benchmarks/track-effects/run.ts`. Pure in-memory: reuses
`track-throughput/scenarios.ts` states, no processor or Kafka. Times per scenario:
`computeTrack`, `readSubject(after)`, `decideEffects`, and each piece inside it. Prints a table.
Also a `--alerts` variant with one customer alert per feature and `--topup` with an enabled
config. Every later unit reports before/after from this.

### 2 · The decision carries its outcome

- `computeTrack` and `computeFinalize` return `{ mutation, outcome }` (the outcome is not logged;
  the mutation is unchanged). Callers: worker `track.ts` / `finalize.ts`, engine tests,
  balance-webhooks tests.
- `DeductionOutcome` gains `usageWindowConsumed: Record<string, number>` (by limit key).
- `decideEffects({ mutation, outcome, before, after })` — `after` stays for now.
- `mutationToAffectedFeatures` → `outcomeToAffectedFeatures`: deltas → rows → features. Same
  fallback to the tracked feature when nothing moved.
- Fold in overview's quick win: `checkLimitReached` tests `after` first, `before` only when
  refused.

Identical effects; the change is plumbing. ~−15µs.

### 3 · Limit reached as a continuation

Engine: `computeCheckContinuation({ fullSubject, command, deltas, usageWindowConsumed })`
→ `{ before: CheckResult; after: CheckResult }`, lazily evaluated: `after` first, `before` only on
request. One `setupDeductionContext` with the *check's* request (reject mode, overdue block
honoured — so no assumption that the check's selection equals the track's), then
`deductFromBuckets` from a seeded `DeductionState`. Deltas on rows outside the check's
selection are ignored by construction, which is what a rebuilt `after` would show.

`checkLimitReached` uses it. `findBlockingUsageLimit` (only on a `usage_limit` refuse) reads the
check context's `usageWindowLimits` + consumed instead of `after.usage_windows`.

~20µs → ~3µs on the common "still allowed" track. Byte-identical output; the existing
`subjects-to-balance-webhooks` cases are the spec, plus continuation cases in the engine
(seeded deltas on a row outside the selection, seeded window consumption, refund deltas).

### 4 · Alerts and auto top-up from the outcome

- Config first: resolve alert scopes / auto-topup control / threshold-billing price for the
  affected features and return before touching rows when nothing is configured.
- Balance-basis alerts: `ApiBalanceV1` before from `before`, after by projecting the affected
  feature's rows through the deltas, per scope (customer scope reads the entity-less view).
  `usage_limit` basis reads `context.usageWindows` + consumed.
- Auto top-up: remaining balance after = customer-level rows projected through the deltas
  (auto top-up pools every entity, so its rows are read at the customer level, not the track's
  entity view).

### 5 · Drop the `after` join

`decideTrack` / `decideFinalize` stop calling `readSubject(nextState)`. `decideEffects` takes
`{ mutation, outcome, before }`. Removes one join and one catalog read per track.

## Out of scope

- Catalog read once per track (overview phase 2).
- Replacing `decimal.js` in the draw.
- Server legacy path (`balance-webhooks` exports it uses stay).

## Open questions

1. `computeTrack` return type changes vs a sibling `computeTrackDecision`. Recommendation:
   change the return type — one function, callers are few, and the mutation is still the
   first thing it returns.
2. Unit 3 lives in `balance-engine/src/commands/check/`. Name: `computeCheckContinuation`?
   Engine vocabulary is `compute*`; "continuation" matches how `computeFinalize` already
   describes its forward draw.
