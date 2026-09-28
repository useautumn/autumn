---
author: john + claude
feature: balance-worker-track-throughput / lean effects
date: 2026-09-25
status: plan — unit 1 in progress
parent: overview.md
---

# One row selection per track

Profile of `john/one-record` (merged 2026-09-25), typical scenario, processor path, 122µs/track:

```
decideTrack                              44%
  ├ decideEffects → checkLimitReached    20%   a 2nd full deduction to ask "empty now?"
  ├ computeTrack                         11%
  └ catalog keys / subject join          ~10%
commit: serialize + append               ~14%
decimal.js (self, everywhere)            12%
```

The 20% is `computeCheck(after)`: it re-selects the feature's rows (`setupDeductionContext`, ~9%)
on a subject rebuilt for it (`readSubjectWith(nextState)`, ~9%), then draws a hair (~2%). The track
selected the same rows a moment earlier and knows exactly what it moved.

## The unit

**A check right after a deduction draws on the deduction's own context.** The engine already
draws "on top of" prior deltas (`computeFinalize` seeds `deductionState.deltas`); the missing piece
is that a context is set up *for one request*, and two request terms can change which rows it
holds and how far they may move:

| term | where setup reads it | when it matters |
|---|---|---|
| `overageBehavior` | `resolveRowBounds.usageAllowedOf` | a free allocated row runs over under `cap`, not `reject` |
| `enforceOverdueBlock` | `selectDeductionRows.isOverdueBlocked` | a past-due product funds a track but not a check, when the org blocks overdue |

So the context records what it was selected for and whether those two terms mattered, and a
request-time draw reads its own terms off the deduction state.

```ts
// DeductionContext
selectedFor: DeductionRequest;              // the request the rows were selected and bounded for
boundsDependOnOverageBehavior: boolean;     // a free allocated row is selected
rowsDependOnOverdueBlock: boolean;          // a past-due product's funding turned on the flag

// DeductionState
overageBehavior: OverageBehavior;           // the draw's own term; `allowsNegative` reads it here

// deduction/setup/contextServesRequest.ts
contextServesRequest({ context, request }): boolean
  // every field of selectedFor equal (value aside), except the two terms when the context
  // proved it does not depend on them

// commands/check/checkAfterDeduction.ts
checkAfterDeduction({ fullSubject, command, outcome }): { after: CheckResult; before: () => CheckResult }
  context = contextServesRequest(outcome.context, checkRequest) ? outcome.context : setupDeductionContext(...)
  after   = draw a hair with outcome.deltas + usageWindowConsumed seeded (nothing when rejected)
  before  = draw a hair from stored balances, on demand
```

Byte-identical to `computeCheck(after)`: when the context is reused the rows and bounds are the
same by construction; when it is not, the exact setup runs. The fallback is the engine's own
setup, not a second implementation.

## Units

1. **Engine: terms on the state, provenance on the context, `checkAfterDeduction`.**
   `computeTrackDecision` / `computeFinalizeDecision` return `{ mutation, outcome }` (wrappers keep
   `computeTrack` / `computeFinalize` for the 20 existing callers; precedent `RecalculateBalanceDecision`).
   `DeductionOutcome.usageWindowConsumed`. Tests: `contextServesRequest` cases; `checkAfterDeduction`
   equals `computeCheck(after subject)` for plain, emptied, usage-cap, refund, overflow track,
   free allocated row (fallback), overdue-blocked org (fallback), rejected track (nothing seeded).
2. **Webhooks + worker.** `checkLimitReached` uses `checkAfterDeduction`; affected features from
   `outcome.deltas` (drops the subject scan); `decideEffects({ decision, before, after })`.
   `findBlockingUsageLimit` (usage_limit refusals only) still reads `after`.
3. **Bench.** `benchmark:effects` microbench per piece + `benchmark:track` before/after.
4. Later, separate: alerts / auto top-up off the outcome, then drop the `after` join.

## Out of scope

Catalog keys per state, decimal.js in the draw, commit serialization.
