# Merging dev into the balance worker branch

Log of every dev merge into `john/one-record`, with the last dev commit that was merged AND
audited. The next re-merge only needs to look at commits after that one.

| Date | dev commit merged | merge commit | audited through |
|---|---|---|---|
| 2026-09-24 | `0b66f78a4c` (Merge branch 'main' into dev) | `37d354e059` | `0b66f78a4c` |

Not yet merged as of 2026-09-24: `cf6bfe9a2d` (PR #3631, `charlie/sync-schedule-released`, 3 commits:
a new `handleStripeSubscriptionScheduleReleased` webhook handler + `runStripeWebhookHandlers` wiring).
It landed on dev after the merge above was cut.

## Why a merge here needs an audit

This branch moved and rewrote a lot of server logic (API renderers into `shared/api`, credit rates and
usage limits into `shared/utils`, `executeAutumnBillingPlan` into four steps, deduction into
`packages/balance-engine`). A change dev lands in the OLD location does not conflict cleanly:
git reports "modified on dev, deleted here", and keeping the deletion silently drops dev's change.
Worse, a file this branch gutted into a thin wrapper still auto-merges, so dev's logic lands in dead code.

## The audit (run after every merge, before pushing)

1. Pin `DEV` to the exact commit merged (`cat .git/MERGE_HEAD` before committing), never to `origin/dev`,
   which keeps moving.
2. For every path dev touched between the merge base and `DEV`: if `DEV:path` and `HEAD:path` are the same
   blob, dev's change is intact. Otherwise diff line sets: every line dev added must appear in the merged
   file, every line dev removed must be gone. Review each hit by hand.
3. Dev-deleted files must not exist in the merged tree; dev-added files must.
4. For each hand-reviewed file, list the dev commits that touched it (`git log --no-merges DEV --
   <files>`) so the review is commit-aware.
5. Separately, list dev commits under `server/src/internal/balances`, `shared/utils/cusEntUtils`,
   `shared/utils/featureUtils`, `shared/utils/cusProductUtils`: the engine mirrors that logic. A change
   made only in the server copy has to be mirrored in `packages/balance-engine` (or moved into shared).

The 2026-09-24 run: 2,466 dev-touched paths, 2,369 identical, 42 differing (all this branch's own import
moves, view types, and exports on top of dev's version), 4 missing (ported by hand, below).
Of 510 non-merge dev commits, 469 merged with no file needing review.

## Ported by hand on 2026-09-24

| dev change | where it lives now |
|---|---|
| `executeAutumnBillingPlan.ts`: `mayTouchLicenses` counts `patchCustomerProducts[].insertCustomerLicenses`; relock-currency comment | `execute/executeAutumnBillingPlan/runPlanSideEffects.ts`, `writePlanRows/writeCustomerRowsInPostgres.ts` |
| `executePatchCustomerProducts` inserted a patch's new license pools (Postgres path only) | `insertCustomerLicensePools` via `planToNewCustomerLicensePools`, on `writePostgresOnlyRows` so the worker path mints them too |
| `getCreditRateCard` takes the row's `invoice_credit` stamp; `isInvoiceCreditCustomerEntitlement` | `shared/utils/featureUtils/creditRates/getCreditRateCard.ts`; `shared/utils/cusEntUtils/classifyCusEnt/isInvoiceCreditCustomerEntitlement.ts` (server file re-exports); engine `deduction/setup/resolveCreditCosts.ts` passes it |
| `isEnablingInvoiceCreditFeature` removed with its callers | removed from `shared/utils/featureUtils/classifyFeature/isInvoiceCreditFeature.ts` |
| plan items keep `proration`; `includeProration` removed | `shared/utils/productV2Utils/productV2ToApiPlanV1.ts`, `shared/utils/planV1Utils/licenses/fullProductsToLicenseCustomize.ts` |
| `calculateNextExpiry` exported from `rolloverUtils.ts` | `shared/utils/cusEntUtils/rolloverUtils/getRolloverUpdates.ts` |
| `isThresholdBillingProduct` reads `isThresholdBillingPrice` | equivalent to `shared/utils/cusProductUtils/classifyCustomerProduct/isThresholdBillingCustomerProduct.ts`; dev's file dropped |
| unlimited entitlements reset on an interval (`isResettingEntitlement`) | inherited by the engine through shared; engine `fullSubjectToDueRows` test updated |
| migrations `0079`–`0083` collided with ours `0082`–`0086` | ours regenerated as one `0084_red_morlun.sql`, same DDL |

## Known gaps that are NOT merge damage (as of 2026-09-24)

- The worker track path never calls `triggerAutoTopUp`; only `runRedisTrackV3` / `runPostgresTrackV3` do.
  Dev's threshold settlement (`runBalanceReplenishment`) and auto top-ups do not fire after a
  worker-side deduction.
- 72 server unit failures (finalizeLock, replay, shadow, handle-track, workerStateToFullSubject) were
  identical before and after the merge.
- `packages/kafka` convention test fails on `sendTransactionalBatch.ts` arrow callbacks.
