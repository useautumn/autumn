# Units of work

Each unit is end to end: the route runs the new action for the cases it covers, the legacy path keeps the
rest, and the unit ends on green integration tests. Stop for review after each.

| # | unit | covers | ends with this passing |
|---|---|---|---|
| 1 | **The action, free seats.** `createEntities` setup → errors → compute → execute; `insertEntities` + seat `balanceChange −N` + linked `ce.entities` seeds in one plan. `entities.create` takes it when no seat is paid, nothing is claimed, and no entity defaults apply; else legacy. | multiple entities, usage_limit, consumable, duplicates, billing_controls | `create-entity-race`, `create-entity-allocated-v2`, `new-per-entity` 3, `concurrent-track5`, `track-race-condition4`, `update-entity-billing-controls`, `attach-addon-entity-usage` |
| 2 | **Entity defaults in the plan.** `computeEntityDefaults`: one plan for all entities' free defaults + in-plan pooled transition. Delete `attachDefaultProductsToEntities`. | defaults, pools | `default-applies-to-entity`, `default-version-attach`, a new pooled-default case |
| 3 | **Id-less and claim.** `updateEntities` facet (shared schema + Postgres step). Claim = update + linked key seed, no seat change (decision 1). | id-less, claim | `attach-edge-cases` 3; new: create id-less → claim → seat used once, `ce.entities[newId]` seeded |
| 4 | **Paid seats.** `computeSeatChangePlan` calls the allocatedInvoice compute; reused replaceables move their linked keys; Stripe first, unpaid → nothing written. The route drops its legacy branch; delete the create half of `createEntityForCusProduct` / `adjustAllowance`. | allocated v1 invoices | `create-entity-paid` entity1–5, `legacy-upgrade-usage` 3 |
| 5 | **`entity_data` onto the action.** `options.allowPaidSeats: false`; defaults and controls per decision 2. Delete `autoCreateEntity`. | auto-create | `check-misc` 1/2/4/5, `track-misc` 1/6, `attach-misc`, new: paid seat → 400 |
| 6 | **The worker lane.** Map writes as `addEntries.entities`; `entity_exists` precondition; id-less → Postgres lane; `withCreateIfMissing` handles `ENTITY_NOT_FOUND` with `entity_data`. | atomic on the worker | worker integration: create + concurrent track on a sibling entity → no lost update; two creates → one `applied`, one `entity_exists`; server: check with `entity_data` on the rollout |
| 7 | **Delete on the same unit** (later). `removed` on the seat change; entity products cancelled in the plan; fix the cascade orphaning. | delete | `create-entity-paid` delete cases, `delete-entity` |
