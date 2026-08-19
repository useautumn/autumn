# catalogV2 feature cases — test matrix

Every create / update / remove case for `catalogV2.update` + `preview_update`,
mapped to the test that owns it. Blocker rows mirror
`features/utils/updateFeatureUtils/detectFeatureUpdateBlockers.ts` (V1's live
matrix); deletion rows mirror V1 `applyMissingFeatureRemovals` plus the
projected-batch semantics that are new in V2.

## Create — `create-features.test.ts`

| Case | Covered |
|---|---|
| Insert one feature of each type (boolean, continuous, consumable, credit_system, ai_credit_system) | ✓ |
| Preview reports `create` per feature and writes nothing | ✓ |

## Update: id change — `update/update-feature-id.test.ts`

| Case | Covered |
|---|---|
| Clean rename applies; old id gone, new id present | ✓ t1 |
| Product items follow — active AND archived products | ✓ t1 |
| Usage price `config.feature_id` follows | ✓ t1 |
| Credit-system schema `metered_feature_id` follows | ✓ t1 |
| Entity-scoped items (`entity_feature_id`) follow | ✓ t4 |
| Preview: action `update`, `previous_attributes.id`, writes nothing | ✓ t1 |
| Identical re-send after rename → action `none`, no write | ✓ t1 |
| Blocked: target id exists (persisted) → `duplicate_feature_id` | ✓ t2 |
| Blocked: target id inserted by the SAME call (projected) | ✓ t2 |
| Blocked: id swap in one call (order-dependent renames) | ✓ t2 |
| Blocked: customer history — active customer product | ✓ t3 |
| Blocked: customer history — EXPIRED customer product | ✓ t3 |
| Preview throws the same errors | ✓ t2 |
| Atomicity: failed batch writes nothing | ✓ t2 |

## Update: type change — `update/update-feature-type.test.ts`

| Case | Covered |
|---|---|
| boolean→metered allowed with product refs; ents → unlimited/lifetime | ✓ t1 |
| metered→boolean allowed; ents stripped (allowance, interval, entity scoping) | ✓ t1 |
| Preview `previous_attributes` exact ({type, consumable}) | ✓ t1 |
| Blocked: customer history — active | ✓ t2 |
| Blocked: customer history — expired | ✓ t2 |
| Blocked: feature scopes an entity item (`used_as_entity_feature`) | ✓ t2 |
| Blocked: feature has a usage price (`has_usage_price`) | ✓ t2 |
| Blocked: metered→credit_system switch (even unreferenced) | ✓ t3 |
| Blocked: credit_system→metered switch | ✓ t3 |
| Blocked: credit_system→ai_credit_system switch | ✓ t3 |
| Allowed: metered→ai_credit_system (not a classic CS switch) | ✓ t3 |
| Blocked: metered referenced in a CS schema (`used_in_credit_system`) | ✓ t3 |
| `used_in_product_credit_system` | unreachable — only fires on CS↔X switches, which `type_switch_credit_system` throws first |

## Update: usage type (consumable) — `update/update-feature-usage-type.test.ts`

| Case | Covered |
|---|---|
| single→continuous allowed with product refs; ents → lifetime interval | ✓ t1 |
| single→continuous: price `should_prorate=true`, `stripe_price_id=null` | ✓ t1 |
| continuous→single (flip back): price `should_prorate=false` | ✓ t1 |
| Preview `previous_attributes` exact both directions | ✓ t1 |
| Blocked: in a CS schema (`used in credit system <id>`) | ✓ t2 |
| Blocked: scopes an entity item | ✓ t2 |
| Blocked: customer history | ✓ t2 |

## Update: field diffs — `update/update-feature-diff.test.ts`

| Case | Covered |
|---|---|
| Identical entry (collections reordered) → `none` | ✓ t1/t2/t3 |
| Omitting `display` keeps the current one → `none` | ✓ t1 |
| Omitting `event_names` wipes them → real diff | ✓ t1 |
| `name`, `consumable`, `display` diffs exact | ✓ t1 |
| `credit_schema`: order-insensitive; cost + entry changes captured whole | ✓ t2 |
| `default_markup`, `provider_markups`, `model_markups` diffs exact | ✓ t3 |
| Omitting `archived` on an archived feature preserves archived (no silent unarchive) | ✓ t4 |
| `archived: false` unarchives; `previous_attributes.archived` exact | ✓ t4 |

## Preview usage — `preview/preview-usage-persisted.test.ts` + `preview/preview-usage-projected.test.ts`

| Case | Covered |
|---|---|
| Plan item + credit system → `will_archive` + reason messages from usage buckets | ✓ persisted |
| Unreferenced → `will_archive: false`, empty `reasons` | ✓ persisted |
| Plans cap: 5 plans → `count` 3, `count_capped`, 2 samples, capped reason message | ✓ persisted |
| Customer attach → named sample + `Attached to customer "X".` | ✓ persisted |
| Standalone balance → customer sample, no plans | ✓ persisted |
| Two standalone balances → `Attached to customer "X" and 1 more.` | ✓ persisted |
| Update rename entry carries `usage.plans` with empty `reasons` | ✓ persisted |
| Remove F + same-call CREATE CS → projected CS usage + archive | ✓ projected |
| Remove F + same-call REMOVE CS → `credit_systems.count` 0, empty reasons | ✓ projected |
| Remove F + same-call UPDATE CS drop F → `credit_systems.count` 0 | ✓ projected |
| Remove F + same-call RENAME CS → sample id is projected NEW CS id | ✓ projected |
| CREATE F + CREATE CS (no persisted state) → create entry projected CS usage | ✓ projected |
| CS cap: 4 credit systems → `count` 3, `count_capped`, 2 samples | ✓ projected |

## Remove: verdicts — `remove/remove-features.test.ts`

| Case | Covered |
|---|---|
| Unreferenced → HARD DELETE (row gone) | ✓ t1 |
| Already-archived unreferenced → hard delete | ✓ t1 |
| Preview: action `delete` + `will_archive` verdict, writes nothing | ✓ t1/t2/t4 |
| Archive: entitlement on an active product | ✓ t2 |
| Archive: entitlement on an ARCHIVED product | ✓ t2 |
| Archive: usage price | ✓ t2 |
| Archive: referenced by a persisted CS schema | ✓ t2 |
| Archive: scopes entity items | ✓ t2 |
| Archive: customer history — EXPIRED customer product (`has_customers: true`) | ✓ t3 |
| Projected: CS + its metered feature removed together → BOTH hard delete | ✓ t4 |
| Same metered feature alone → would only archive (contrast) | ✓ t4 |
| Same-call CS INSERT keeps referencing removed feature → ARCHIVE (not 400) | ✓ t5 |
| Same-call CS UPDATE keeps referencing removed feature → ARCHIVE (not 400) | ✓ t5 |
| Same-call CS UPDATE drops its reference → removed feature HARD DELETES | ✓ t5 |

## Same-call ordering — `same-call-ordering.test.ts`

Compute fold: `update → insert → remove` (re-project after each step).
Execute: `insert → update → remove`. Inserts sort non-CS before CS.
Update blockers ignore CS rows **inserted** in this call; they see projected
schema drops and CS removals. Remove `will_archive` stamping lives in
`remove/remove-features.test.ts`.

| Case | Covered |
|---|---|
| CREATE consumable + CREATE CS (CS listed first) → succeeds via insert sort | ✓ |
| CREATE continuous + CREATE CS → throws, atomic | ✓ |
| UPDATE →consumable + CREATE CS → succeeds (projected post-update) | ✓ |
| UPDATE →continuous + CREATE CS → throws, atomic | ✓ |
| UPDATE →consumable + UPDATE CS add member → succeeds (new CS refs don't block) | ✓ |
| UPDATE →continuous + UPDATE CS keep member → throws, atomic | ✓ |
| UPDATE CS drop member + UPDATE →continuous → succeeds (blocker re-judged) | ✓ |
| REMOVE CS + UPDATE →continuous → succeeds; CS hard-deletes | ✓ |
| REMOVE CS + metered→boolean → succeeds | ✓ |
| CREATE consumable + UPDATE CS add it → succeeds (execute insert→update) | ✓ |
| CREATE continuous + UPDATE CS add it → throws, atomic | ✓ |
| RENAME A→B + CREATE CS on B → succeeds (projected id) | ✓ |
| RENAME A→B + CREATE CS on B (CS listed first) → succeeds | ✓ |
| Remove F + same-call CS keeps referencing F → ARCHIVE | ✓ remove-features t5 |
| Remove F + same-call CS drops its reference → hard delete | ✓ remove-features t5 |
| Remove F + REMOVE its CS in same call → both hard delete | ✓ remove-features t4 |

## Remove: errors — `remove/remove-features-errors.test.ts`

| Case | Covered |
|---|---|
| Upsert + remove the same feature in one call → 400 | ✓ t1 |
| Unknown feature id → 404 `feature_not_found` (update AND preview) | ✓ t2 |

(A same-call CS referencing a removed feature is a VERDICT, not an error —
see remove-features t5. Locked in `catalog_update_ordering` plan, rule 1.)
