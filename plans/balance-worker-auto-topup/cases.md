# Case matrix: the trigger predicate

Every branch of the server functions the package replaces, as a test row. `parity` rows run the
verbatim legacy copy beside the new function and assert the same outcome; every row is a parity row.

## `subjectToAutoTopupObjects` (was `fullCustomerToAutoTopupObjects`)

| # | config resolution | expect |
|---|---|---|
| O1 | no config on customer or plan | null |
| O2 | customer config disabled | null |
| O3 | customer config disabled, plan config enabled | null (customer list is consulted first and shadows the plan) |
| O4 | config only for another feature | null |
| O5 | customer config enabled and a plan config too | customer wins: no source plan, candidates ranked |
| O6 | plan config only, plan holds a one-off prepaid row | that plan's row, even when a cheaper plan's row exists |
| O7 | plan config only, source plan has no one-off prepaid row | null, no fallback to another plan |
| O8 | plan config on two plans | most recently attached plan sources it |

| # | charge source | expect |
|---|---|---|
| S1 | no rows for the feature | null |
| S2 | rows exist, none one-off prepaid: monthly prepaid, pay-per-use, fixed one-off | null |
| S3 | expiring grant (loose row with `expires_at`) alongside a plan row | plan row is the source; the grant's balance still counts |
| S4 | only an expiring grant | null |
| S5 | subscription plan vs standalone top-up bought later | plan (10 ranking cases, ported) |
| S6 | row on a `scheduled`/`expired` product | ignored; `past_due` rows count |
| S7 | license seat assignment row (entity product with a license link) | ignored |
| S8 | entity-scoped rows of a customer view | pool up: counted in the balance, never narrowed (server parity) |
| S9 | expired row (`expires_at <= now`) | ignored; a future expiry counts |
| S10 | entity view with `disable_pooled_balance` | only the entity's own rows |
| S11 | pooled-balance source row | ignored |

| # | threshold | expect |
|---|---|---|
| T1 | balance above threshold | objects returned, `balanceBelowThreshold: false` |
| T2 | balance equal to threshold | below (`<=`) |
| T3 | threshold 0, balance 0 | below |
| T4 | threshold 0, balance 50 | not below |
| T5 | rollover balance | counts toward the balance |
| T6 | balance summed across every row of the feature, not only the charge source | yes |

## `resolveThresholdSettlement`

| # | case | expect |
|---|---|---|
| R1 | no row carries a pay-per-use price with a threshold | `not_threshold_billed` |
| R2 | threshold price, overage below the threshold (99 of 100) | `nothing_to_settle` |
| R3 | overage at or past the threshold (100, 140, 240) | `settle`, `chargeUnits` = threshold, `remainingUnits` = rest |
| R4 | prepaid price with a `threshold_billing` block | ignored: only pay-per-use prices threshold-bill |
| R5 | threshold `<= 0` or missing | ignored |
| R6 | loose row (no product) | skipped |
| R7 | two threshold rows, first below and second past | settles the second |
| R8 | entity-scoped row | overage summed over the `entities` map |
| R9 | `computeThresholdCharge` with `claimedUnits` | charges only the unclaimed chunk (4 cases, ported) |

## `subjectToAutoTopupTriggers` (was the loop in `triggerAutoTopUp`)

| # | case | expect |
|---|---|---|
| G1 | tracked feature below its threshold | one trigger, `balance_below_threshold`, with the config |
| G2 | tracked feature above threshold, no threshold billing | none |
| G3 | tracked feature funds a credit system whose balance fell below its config | trigger for the credit feature, not the tracked one |
| G4 | tracked feature and the credit system both fire | two triggers, tracked first |
| G5 | credit system row is expired or a license assignment | not a candidate |
| G6 | threshold settlement only, no auto top-up config | one trigger, `threshold_settlement`, no config |
| G7 | threshold settlement with a config present but balance above threshold | `threshold_settlement` carrying the config |
| G8 | below threshold and settlement both true | one trigger, `balance_below_threshold` |
