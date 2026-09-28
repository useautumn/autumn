# Balance worker: response parity with legacy

A route-by-route audit of where the worker route answers differently from legacy, and what we decided.
Rule: legacy and worker must answer with the same shape; where they differ, both move to the cleaner behavior,
even if that changes legacy. Error code and message wording is out of scope.

## Fixed

- [x] Track by `event_name`: the worker dropped `event_name` from the response.
- [x] Check `with_preview` and `product_id`: the worker refused both with a 400. Product checks now run before
  routing; the preview is built from the worker's answer.
- [x] `/usage` on a feature with no balance: legacy answered 200 and did nothing. Both now 404, as
  `balances.update` does.
- [x] `entities.get` by a pending (id-less) entity's internal id: the worker answered 500.
- [x] Worker unreachable: `balances.finalize` and `/track_tokens` answered 503. Both now queue on the command log
  and answer 202, as `/track` does.

## To fix

- [x] Check `balance` counted past-due plans on the worker when the org renders only active ones. The worker now
  follows legacy's status filter.
- [x] Org rate cap degraded: legacy check and track fail open (202); the worker ignored it. The worker now fails
  open too (lock checks still always reach the worker).
- [x] Bare `expand: ["feature"]`: the worker added `balance.feature`, legacy didn't. The worker now scopes
  `expand` to `balance.` the way legacy does.
- [x] `lock` removed from the `/track` body: only checks take locks. Legacy used it; the worker ignored it.
- [ ] Entity auto-create with `entity_data.billing_controls`: the worker saves them, legacy drops them. Legacy's
  `autoCreateEntity` saves them too.
- [x] Track by `event_name` fanned out through one credit system: the worker's `balance` came from the first
  feature's reply (before the second deduction), so it disagreed with its own `balances`. The last reply wins.

## Kept as the worker has it

- Check with an unlimited credit system: `balance` shows the balance the next draw comes from.
- Plain check across a feature and its credit system: allowed when both together cover it, as a track would draw.
- Plain check, nothing attached, `required_balance: 0`: allowed.
- Entity `getOrCreate` with `expand: invoices`: returns the customer's invoices (the expand is deprecated).

## Skipped

- Customer-level check `balance` includes entity rollups on legacy: rollups are deprecated.
- The worker's paid-allocated Postgres fallback check: no `balances` map, `required_balance` not in credits.
  Credit systems are never paid allocated, and the fallback never deducts from more than one feature.
- Breakdown and flag order when rows share `created_at`.
- Error code and message wording differences.

## Open

- Rest of the track audit: refund/zero-draw `balance`, fan-out `deductions` merging, event_name + reject,
  backdated `timestamp`, feature_override credit systems, batch partial failure, worker-only statuses.
