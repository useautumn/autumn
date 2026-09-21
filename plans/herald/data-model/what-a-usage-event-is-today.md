# What a usage event is today

One row, 17 columns, written to two places from the same object (`shared/models/eventModels/eventTable.ts:19-40`).

```
track { customer_id: "cus_1", feature_id: "messages", value: 5, properties: { model: "x" } }

  id                   evt_2f9…            random, generateId("evt")
  org_id / org_slug / env
  customer_id          cus_1               internal_customer_id  cus_3Jd…
  entity_id            null                internal_entity_id    null
  event_name           messages            the feature id, or the raw event_name
  value                5
  properties           { model: "x" }
  timestamp            now, or the caller's    created_at = the same instant, in ms
  idempotency_key      null
  set_usage            false               always
  internal_product_id  prod_pro            the ONE plan that paid the most
  deductions           [{ balance_id, feature_id, plan_id, reset, value: 5 }]
```

## Two stores, fed differently

| | Postgres `events` | Tinybird `events` |
|---|---|---|
| who reads it | the integration tests, the dashboard's last-N events | `events.list`, every analytics rollup |
| written by | an SQS job, `onConflictDoNothing` on `id` | the API server, HTTP Events API, `wait: true` |
| in production | **skipped** unless `NEON_EVENTS_DATABASE_URL` is set (`runInsertEventBatch.ts:43-45`) | always |
| duplicates | absorbed by the primary key | **none absorbed**: plain `MergeTree`, no dedup in any pipe |
| `deductions` | the array, or null | `{"list":[…]}`, or the string `"{}"` (`mapEvent.ts:52-54`) |

The catch: Tinybird is the source of truth and has no protection. Postgres has protection and is barely read.

## What each call writes

```
scenario: 15 messages, lock 8
action                          events written      value
check + lock 8                  1                   +8
finalize, confirm at 8          none                (nothing changed)
finalize, confirm at 11         1                   +3     final - lock
finalize, confirm at 5          1                   -3
finalize, release               1                   -8
lock expires                    1                   -8     expiry is a release
```

`insertFinalizeLockEventV2.ts:26`: `value = finalValue - lockValue`. The finalize event carries the lock's properties unless the finalize sends its own (`buildFinalizeLockContextV2.ts:70`).

## Easy to miss

- An `event_name` track writes **one** event, not one per feature. The per-feature split is only in `deductions`.
- A credit-system track is recorded under the **tracked** feature. The credit pool shows up only as `deductions[].feature_id`.
- A feature the customer holds no balance for still gets an event, with `deductions: null`.
- `skip_event: true` deducts and writes nothing.
- A caller's `timestamp` sets both `timestamp` and `created_at`. The tests order by `created_at`, Tinybird orders by `timestamp`.
- The balance worker path writes no events at all. The only three write sites are the legacy Redis track, the legacy Postgres track and `insertFinalizeLockEventV2`.

## What the tests actually check

`expectCustomerEventsCorrect` sleeps 3 seconds, reads **Postgres**, and asserts the count, the order (newest first) and each `value`; `properties` only when the test passes them. It never looks at `deductions`, `event_name`, ids or timestamps. One test reads the full row: `finalize-lock-event-deductions.test.ts:94-111`.
