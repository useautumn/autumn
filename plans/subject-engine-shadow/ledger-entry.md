# The ledger entry

The journal's record format. It outlives every refactor, so it is designed from the full mutation
surface of a subject — every table `AutumnBillingPlan`, resets, rollovers, pooled balances, locks and
imports touch — not from track.

## Shape

```
LedgerEntry
├── envelope   who · where · when · order · provenance     stable forever
├── changes[]  the write-set: table-scoped row ops         what the projector and replay apply
└── facts      typed by `kind`: the meaning                 what Tinybird, webhooks, audit read
```

`changes` alone rebuilds a subject or projects it into any store without knowing which operation
produced it. `facts` alone serves a consumer that never wants to parse rows. A new operation is new
rows in `changes` (projector unchanged) plus a new `facts` variant (consumers opt in).

```ts
type LedgerEntry = {
  schema_version: 1;
  id: string;                           // ksuid "le_…"
  org_id: string; env: AppEnv;
  customer_id: string; internal_customer_id: string;
  shard_id: number;                     // = partition
  version: number;                      // per customer, gapless — the only order that matters
  at: number;                           // the command's clock; what the fold used
  recorded_at: number;                  // wall clock at append; lag and debugging only
  command: { id: string; kind: string; api_version?: string; correlation_id?: string };
  kind: EntryKind;                      // discriminates `facts`; mirrored as a Kafka header
  changes: RowChange[];
  facts: Facts;
};

type RowChange =
  | { table: SubjectTable; op: "insert"; id: string; row: DbRow<table> }
  | { table: SubjectTable; op: "update"; id: string; set: Partial<DbRow<table>> }
  | { table: SubjectTable; op: "delete"; id: string };

type SubjectTable =
  | "customers" | "entities"
  | "customer_products" | "customer_prices" | "customer_entitlements" | "entity_balances"
  | "rollovers" | "replaceables" | "pooled_balances" | "pooled_contributions" | "usage_windows"
  | "customer_licenses" | "subscriptions" | "invoices" | "schedule_phases" | "locks";
```

Row values are the shared `Db*` model shapes (the zod schemas Postgres rows already validate against),
so `changes` is typed per table and exhaustive in TypeScript. `set` carries **absolute** values —
`balance: 95`, never `-5` — so applying an entry twice is harmless.

## Kinds

| kind | produced by | `changes` touch | `facts` |
|---|---|---|---|
| `balance_deducted` | track, check-with-lock | customer_entitlements, rollovers, usage_windows, entity_balances | below |
| `balance_updated` | set / adjust balance, auto top-up, recalculate | customer_entitlements (+ rollovers) | `{ customer_entitlement_id, field, before, after, source }` |
| `lock_reserved` / `lock_finalized` / `lock_expired` | check lock, finalize, expiry timer | locks + the balance rows | `{ lock_id, feature_id, amount, receipt: deductions[] }` |
| `period_rolled` | the shard's timer (later) | customer_entitlements, rollovers | `{ customer_entitlement_ids, next_reset_at, rollovers_minted: [{ id, balance, expires_at }] }` |
| `billing_plan_applied` | attach, update, cancel, schedule, migration, webhook apply | products, prices, entitlements, licenses, pooled, subscriptions, invoices, phases, customers.currency | `{ action, intent_id?, customer_product_ids: { inserted, updated, deleted } }` |
| `subject_imported` | first sight, cutover, staleness reload | inserts of every row | `{ source: "postgres", reason: "first_sight" \| "cutover" \| "stale" }` |

`balance_deducted` facts:

```ts
{
  requests: [{ feature_id, amount }],
  deductions: MutationLogItem[],          // customer_entitlement_id, rollover_id?, entity_id?,
                                          // credit_cost, balance_delta, adjustment_delta,
                                          // usage_delta, balance_after
  remaining_by_feature_id: Record<string, number>,
  overage_behaviour: "cap" | "allow" | "reject" | "overflow",
  event?: { name, value, timestamp, properties?, idempotency_key? }   // what Tinybird needs
}
```

## Coverage check against `AutumnBillingPlan`

Every section of the plan is either row ops on the tables above or not subject state:

| plan section | in the entry as |
|---|---|
| insertEntities, insertCustomerProducts (+ nested entitlements, prices), patchCustomerProducts, deleteCustomerProducts, updateCustomerProducts | inserts / updates / deletes on entities, customer_products, customer_entitlements, customer_prices |
| updateCustomerEntitlements (balance, next_reset_at, anchor, entities, replaceables) | updates on customer_entitlements, inserts/deletes on replaceables |
| balanceTransitionPlan, autoTopupRebalance, oneOffPurchaseRebalance | updates on customer_entitlements (absolute after-values) |
| pooledBalancePlan | pooled_balances, pooled_contributions, customer_entitlements |
| customerLicenseUpdates / transitions | customer_licenses |
| upsertSubscriptions, upsertInvoice, schedulePhaseCustomerProductReplacements, updateByStripeScheduleId | subscriptions, invoices, schedule_phases |
| lockCustomerCurrency | update on customers |
| customPrices, customEntitlements, customFreeTrial, insertPlanLicenses | **catalog**, written to Postgres by the API node before the command (design §10) — referenced by id |
| lineItems, customLineItems, refundPlan | **not state** — Stripe / reporting side effects, today's SQS workflow |

## Invariants

1. One entry = one command's effect on one customer, applied atomically. Multi-customer commands
   produce one entry per customer, tied by `command.correlation_id`.
2. `version` is gapless per customer. A consumer applies an entry iff `version = projected + 1`;
   equal → duplicate, skip; greater → gap, alarm.
3. Ack ⇒ in the journal ⇒ in every rebuilt memory. `changes` is sufficient to rebuild.
4. `facts` is sufficient for any consumer that does not project rows.

## Evolution

1. **Additive only.** New optional envelope fields, new kinds, new tables, new columns. Never rename,
   remove, or retype.
2. **Unknown is ignored, never fatal**: unknown kind → skip `facts`, still apply `changes`; unknown
   column → ignore; unknown table → skip with a metric.
3. `schema_version` bumps only for a non-additive change; readers keep a decoder per version. Expect
   never to need it.
4. Kafka record: key `org:env:customer_id`, explicit partition `shard_id`, headers `kind`,
   `schema_version`, `version`; value JSON, zstd at the topic. msgpack is for snapshots; the log is
   what you `rpk topic consume` at 2 a.m.

## Sizes

| entry | changes | bytes |
|---|---|---|
| track, one entitlement | 1 update | ≈ 900 |
| track, credit system, 3 entitlements + rollover | 4 updates | ≈ 1.6 k |
| attach | ≈ 20 ops | ≈ 8 k |
| import, typical customer | ≈ 200 inserts | ≈ 25 k |

## Where it lives

`apps/ledger/src/api/journal/ledgerEntry.ts` — zod schema + types, one file per `facts` kind under
`api/journal/facts/`. It crosses process boundaries (shard → Redpanda → projector, consumers), so it
is API, not internal. When the server consumes entries (webhooks), the schema moves to `@autumn/shared`.
