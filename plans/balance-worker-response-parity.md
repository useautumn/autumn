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
- [x] Entity auto-create with `entity_data.billing_controls`: the worker saves them, legacy drops them. Legacy's
  `autoCreateEntity` saves them too.
- [x] Track by `event_name` fanned out through one credit system: the worker's `balance` came from the first
  feature's reply (before the second deduction), so it disagreed with its own `balances`. The last reply wins.

## Kept as the worker has it

- Check with an unlimited credit system: `balance` shows the balance the next draw comes from.
- Plain check across a feature and its credit system: allowed when both together cover it, as a track would draw.
- Plain check, nothing attached, `required_balance: 0`: allowed.
- Entity `getOrCreate` with `expand: invoices`: returns the customer's invoices (the expand is deprecated).
- Track that draws nothing (refund, value 0, capped on empty): `balance` is the balance it touched, not null.
- Track fan-out hitting one balance twice: `deductions` lists each feature's draw, not one merged entry.
- event_name with `overage_behavior: "reject"`: no up-front 400; each feature is decided on its own.
- Backdated `timestamp`: windows, rollovers and expiries are read at the event's time, not the request's.
- Batch track: one append, all queued or a 503 for all.
- Retry after a released idempotency claim: the worker's command id dedup returns the stored result or 409.
- Worker-only statuses (not initialized, stale subject, overloaded, record too large or refused, result unknown).

## Skipped

- Customer-level check `balance` includes entity rollups on legacy: rollups are deprecated.
- The worker's paid-allocated Postgres fallback check: no `balances` map, `required_balance` not in credits.
  Credit systems are never paid allocated, and the fallback never deducts from more than one feature.
- Breakdown and flag order when rows share `created_at`.
- Error code and message wording differences.
- A plan's `feature_override` excluding the tracked feature from a credit system: the worker adds `CS: null`
  to `balances`.

## Open

- One integration sweep over everything touched, on both routes.
