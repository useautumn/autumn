# Case matrix

Worker path only (`isBalanceWorkerRoute()`); the legacy path keeps its blob.
Cache state is checked directly on `getMiscRedis()` like
`misc-cache-families.test.ts` does.

## Unit 1 — subscriptions

| case | setup | action | expect |
|---|---|---|---|
| miss fills | pro attached (sub_A), key absent | `customers.get` | response unchanged; `subscription:sub_A` present, TTL ≤ 3600 |
| hit | key present | `customers.get` | same `current_period_*`; `SubService.getInStripeIds` not called (spy in unit test) |
| partial hit | pro + add-on (sub_A, sub_B), only sub_A cached | `customers.get` | SELECT for sub_B only; both keys present after |
| period roll | key present | Stripe anchor reset → `customer.subscription.updated` | key absent after webhook; next get shows the new period (reuse `billing-cycle-anchor-sync` "manual anchor reset") |
| billing update | key present | `billing.update` that changes the period | key absent; next get fresh |
| new row | fresh customer | `billing.attach` (`upsertByStripeId` insert) | key absent right after (DEL on insert); get fills it |
| skip cache | key present | `customers.get?skip_cache=true` | SELECT runs; key untouched |
| redis down | fake client `status: "connecting"` (unit) | read + write | read falls to SQL; write's DEL warns, row still written |
| ramp | ramp at 100% with fake backup (unit) | invalidate | DEL lands on both targets |

## Unit 2a — one door for invoice writes

Existing suites only: `invoices-insert.test.ts`, `cancel-immediately-refund.test.ts`,
`vercel-invoice-refund.test.ts`, `reissue-invoice.test.ts` (rollback delete
path exercised by "open charge-automatically invoice → voided, replacement
charged now").

## Unit 2b — invoices

| case | setup | action | expect |
|---|---|---|---|
| miss fills | pro attached, key absent | `customers.get?expand=invoices` | `invoices[0]` as today incl. `plan_ids`; `invoices:{internal}` present |
| no expand | key absent | `customers.get` without expand | no key written, no SELECT |
| entity subject | entity on customer | `entities.get` | no invoice SELECT on the worker path; response unchanged |
| pay inline | open invoice cached | `invoices.pay` | key absent; next get shows `paid` (reuse `pay-invoice` case 1) |
| void by webhook | open invoice cached | void in Stripe → `invoice.updated` | key absent; next get shows `void` (reuse `webhook-queue-replay` shape without the failure injection) |
| cycle invoice | one invoice cached | `advanceToNextInvoice` → `invoice.created` / `paid` | next get shows 2 invoices, latest first |
| refund route | paid invoice cached | `POST /customers/:id/invoices/:stripe_id/refund` | key absent; row re-read carries the new `refunded_amount` |
| moved by insert | invoice cached under cus_1 | `invoices.insert` re-homing it to cus_2 | both keys absent |
| rollback delete | draft invoice cached | later Stripe action fails (`reissue` "replacement charged now" shape) | key absent; next get has no draft |
| eleventh invoice | ten cached | new invoice | next get still ten, newest first, oldest dropped |
| skip cache | key present | `skip_cache=true` | SELECT runs; key untouched |
| redis down / ramp | as unit 1 | | as unit 1 |
