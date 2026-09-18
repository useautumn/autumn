# Corrected-fixture evaluation boundary

The original evaluation source and PDF were archived before these edits:

- Archive: `/Users/amianthus/.capy/work/leaf-lab-full/original-eval-source-20260916T143646Z.tar.gz`
- SHA-256, independently verified: `e2e5804eb222fd8bbeccdcc4b311105c9c55850534488940f4f29b269461e26a`
- Retained original run: `~/.capy/work/leaf-lab-full/generalized-second-pass/2026-09-16T14-06-05.408Z-b18f0510-04b3-43bc-b23a-4502e00d8213/`

Original-run scores remain original-run scores. Do not overwrite their artifacts or combine their numerator/denominator with results from these corrected fixtures. Compare implementations on the same fixture revision; label any rerun after this change **corrected fixtures**. A better score on changed expectations is not, by itself, an agent improvement.

## Source corrections

| Source | Original | Correction and evidence |
| --- | --- | --- |
| `apps/leaf/tests/evals/fixtures/plans/plans.ts` | `basePrice.monthly({amount: 500})` returned numeric `50000` but displayed `$500`. Annual prices had the same multiplication. | Return `500` in both the API amount and its display. Autumn amounts are major units; `shared/api/billing/common/billingPreviewResponse.ts` states this explicitly. No processor boundary exists in this API fixture builder. |
| `fixtures/responses.ts` | Every attach preview line said `annual`, even for monthly or customized annual/monthly prices. A requested zero price or zero custom-line-item total fell through `||` to the nonzero catalog price. | Derive the description from the selected amount and actual price interval using shared formatters. Use nullish fallback so explicit zero and removal of the base price remain zero. This fixes the fixture's stated arithmetic, not the limits of its billing simulation. |
| `schedules/multi-year-escalator.eval.ts` | Scenario time was June 12, 2026, but a newly created schedule had to start July 1. Expectations asserted escalated prices but omitted the expressly requested 50,000 or 100,000 monthly credits and entity IDs. | Set scenario time to July 1, 2026; preserve every exact phase-start assertion and price. Assert the selected entity and a prepaid-credit allowance replacement in every year, preserving the paid ladder and monthly credit reset. |
| `schedules/backdated-schedule.eval.ts` | PUT `customize.items` replaced complete plans with a few allowances, discarding unmentioned catalog capabilities and paid credit terms. Net 30 was present in the contract but absent from the expected request. The text incorrectly said four already-included Enterprise flags were not in the standard plan. | Use targeted remove/add patches for member/project/credit allowances, retain catalog booleans and the usage-based credit slot, and preserve/rebase prepaid tiers. Add `net_terms_days: 30`. Correct the false catalog statement without removing the requested capabilities. April 1, 2027 remains the first phase, with scenario time April 15; all original date assertions remain. |
| `schedules/custom-boolean-schedule.eval.ts` | Expectations asserted annual prices and two custom booleans but did not check the PDF's 5,000 credits/month, $0.01 monthly overage, 25 member slots, 100 project slots, or complete purchased feature set. | Replace both catalog credit slots with the expressly contracted included/usage-based credit item. Retain annual $7,500/$20,000, exact April 1 dates, Net 30, draft invoice, entity scope and custom booleans in the body assertion. Removal of unpurchased Revision History and both catalog credit slots is asserted with one filter per catalog slot (`credits`/prepaid and `credits`/usage_based), the API-precise form; a single feature-wide `credits` filter yields the identical effective plan (verified with `applyCustomizeToPlan`), but the per-slot form is what a correct agent produces from the observed catalog. Add `contract_package_complete`, which evaluates effective plans with shared `applyCustomizeToPlan` and checks all listed package capabilities, allowances, the single $0.01 usage-based credit slot, and the absence of Revision History. It judges the executed `createSchedule` body and the preview whose body matches it; a preview that the pre-approval verifier rejected never became a write and is excluded, because the scorer measures the delivered package, not every draft the safety layer refused. The member/project limits may correctly be inherited from Enterprise rather than redundantly rewritten. |

All previous tool-order, approval, phase-date, and response checks remain. The new PDF package scorer adds coverage; it does not replace or relax an existing scorer.

### Credit economics

The catalog has two credit slots: prepaid volume tiers with 1,000 included credits and a separate $0.10 usage-based slot. Removing the prepaid item and adding a price-free allowance does **not** preserve prepaid pricing. The real `setupPatchContext` deletes matched prices, and `handleCustomizeAddItems` creates a fresh price only when the new item supplies it.

For allowance-only escalator/backdated changes, expectations preserve the paid ladder through the existing shared helpers:

1. `subtractIncludedFromTiers({tiers, included: oldIncluded})` converts public total-usage boundaries into paid-usage boundaries.
2. `addIncludedToTiers({tiers: internalTiers, included: newIncluded})` converts them back for the new allowance.

For example, 1,000 → 100,000 included credits changes finite boundaries 2,000 / 3,500 / 5,000 / 7,000 into 101,000 / 102,500 / 104,000 / 106,000; the infinite tier and flat prices are unchanged. Copying the old finite boundaries unchanged would be invalid. The separate usage-based slot remains intact.

The PDF case is different: its $0.01 usage-based rate is an explicit change to catalog economics, so preserving the old prepaid ladder or $0.10 overage would contradict the signed package.

## PDF obligations and the remaining API limitation

The retained PDF text is:

`generalized-second-pass/2026-09-16T14-06-05.408Z-b18f0510-04b3-43bc-b23a-4502e00d8213/012-jev-1-agent_billing_schedules_custom-boolean-schedule.eval.ts/attachment-60bcb7532ddc8a2bb53ca69cddfd06f99dcc45df8b248e945bb3478d5f25f6b3.txt`

The order form specifies:

- A 24-month initial term, Enterprise for the production workspace, 25 member slots, and 100 project slots.
- Hosted Solution and Unlimited Seats, plus the enumerated platform features. Activity Events is the metered feature consumed through the Credits credit system, not a new independent unlimited grant.
- 5,000 credits per month and monthly overage at $0.01 per credit.
- Year-one fees of $7,500 and year-two fees of $20,000, totaling $27,500 before tax; invoices are Net 30.
- Monthly credit resets. The no-carry statement expressly allows underlying package terms or a written amendment to provide carry-forward; this correction does not assert that all rollover is categorically forbidden.
- Section 11: the term begins when the service is provisioned; there is **no automatic renewal** without an express order-form provision. No such provision appears in this order form.

The existing scenario provisions on April 1, 2027; the term-begins-on-provisioning clause supports that start and the April 1, 2028 anniversary. The PDF does not independently state April 1 as a signed service-start date.

**The no-renewal obligation is not implemented by the available `createSchedule` API.** Its schema has neither an end date nor a final-phase cancellation/end-behavior field, and phases require at least one plan. Two priced phases do not prove that access and recurring charges stop after 24 months. The API also does not encode the contract's nonrefundability/legal restrictions merely by creating a schedule.

The user still asks to provision the signed order form in full. That request has not been rewritten to waive the limitation. A truthful agent must disclose the unsupported end-of-term obligation and seek clarification/manual follow-up, or decline full provisioning; it must not claim the contract is fully provisioned. A verifier refusing the request because the 24-month no-renewal obligation is missing can be correct even if the legacy write-oriented case scores it as a failure. Record this as an unsupported-obligation outcome, not a fixture-adjusted success. The additional package scorer measures supported package terms only, not full contractual completion.

## Date and scorer boundaries

`server/src/internal/billing/v2/actions/createSchedule/errors/handleFirstPhaseStartDateErrors.ts` rejects a newly created first phase more than 15 minutes in the future. This guard does not apply in the same way when updating an existing Stripe subscription schedule. Supported backdating has additional paid-recurring, existing-subscription, trial, and checkout constraints; the backdated case keeps its historical start rather than changing it to “now.”

The real schema also supports `starts_at: "now"` and `starting_after`. `normalizeCreateSchedulePhases.ts` resolves those using `currentEpochMs` and shared calendar-duration arithmetic. The fixture response builder currently converts nonnumeric starts to null, and the generic scorer compares array lengths/order and primitive values exactly; `bodyNumberFields` likewise demands numeric timestamps. Thus an API-equivalent relative schedule can fail this harness. This correction does **not** weaken numeric/date assertions or pretend that the mock performs real normalization. Relative-time equivalence needs a separately scoped mock/scorer correction.

The general API matcher treats arrays as exact-length, ordered arrays while objects are subset matches. A later narrowly scoped correction makes only billing `customize.remove_items` and `customize.add_items` arrays order-independent: removal filters describe a set of deletions, and `handleCustomizeAddItems` pushes each added item as an independent price/entitlement, so neither order carries billing meaning. Matching remains one-to-one with the same length and every specified field checked (including nested tiers, which stay ordered). Phases, tiers, and arbitrary metadata arrays remain ordered. Tests cover wrong billing methods, changed allowances/tiers, missing/extra entries, duplicate/overlapping filters, and unchanged ordering checks elsewhere.

The corrected-v1 source before that matcher change is preserved at `~/.capy/work/leaf-lab-full/corrected-v1-before-filter-order-20260916T163404Z.tar.gz`, SHA-256 `3d75a9afedf9413cd41c240ddd9921c5fa332c8a22a1a82bb1cfe86cc1a49c84`. Earlier matched comparisons retain their original scorer results. New runs have a different corpus fingerprint; do not silently join their scores to the earlier baseline.

## Validation

- Independently verified the original archive SHA-256 before editing.
- Leaf TypeScript check passes after the fixture changes.
- Offline diagnostic `~/.capy/work/verify-fixture-corrections.ts` captures the three eval definitions without running an agent or model. It validates all four expected schedule requests with the actual MCP registry schema, checks effective tier boundaries, proves the new PDF package scorer accepts the corrected package and rejects a wrong overage, and checks major-unit, zero-price, and monthly/yearly preview descriptions.
- Updated the existing `$99 -> 9900` assertion in `tests/unit/evals/mock-autumn-server.test.ts` to `99`, consistently with the corrected fixture. The assertion remains active.
- No paid model evaluation was run as part of these corrections. Existing preview mocks remain simplified estimates: they do not implement tax, proration, credits, feature billing, or real schedule invoice aggregation. Their totals are not proof of real billing correctness.
