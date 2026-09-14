# Invoice tooling

2026-09-14 · `claude/invoice-tooling-prd-z040a1` · on `b59a78bc`

Two asks from the Mintlify ↔ Suger/AWS Marketplace integration
([thread](https://autumnpricing.slack.com/archives/C0AD4D62KQF/p1788902553649729)):

1. **Invoice webhook** — when we generate an invoice, push it with a per-entity
   line-item breakdown so they can meter each deployment into Suger → AWS.
2. **Mark invoice paid out of band** — billing settles in AWS, not Stripe, so the
   Stripe invoice needs closing without a charge. *(Part 2, spec'd after part 1 lands.)*

Today they'd have to listen to Stripe's `invoice.finalized` and call
`invoices.list` — Ryan explicitly does not want to touch Stripe webhooks again.

---

## Part 1 — Invoice webhook

### The gap

`invoices.list` returns `ApiInvoiceV1` + list fields — one flat row per invoice, no
line items (`processInvoice` has `items` commented out, `InvoiceService.ts:57`), and
`entity_id` is only the invoice-level `internal_entity_id`.

We already store everything needed in `invoice_line_items`
(`shared/models/cusModels/invoiceModels/invoiceLineItemTable.ts`):
`feature_id`, `total_quantity`, `paid_quantity` (the overage), `amount`,
`amount_after_discounts`, `effective_period_start/end`, and
`customer_product_ids` → `customer_products.internal_entity_id` → the entity.

So the work is **exposing** the breakdown, not computing it.

### 1. Name the webhook — pick one

| Event type | Reads as | Notes |
|---|---|---|
| `invoice.created` | "we made an invoice" | Matches existing `billing.*` / `balances.*` noun.verb style. Collides mentally with Stripe's `invoice.created` (draft), which fires *earlier* than we mean. |
| `invoice.finalized` | "it's locked, amounts are final" | Most accurate — this is the moment the numbers stop moving. Same Stripe-name-collision concern, but here the semantics actually match. |
| `invoice.generated` | "we generated it" | Ryan's own word. Unambiguously ours, no Stripe overlap. |
| `billing.invoice_created` | groups under existing `billing.*` | Consistent with `billing.updated` / `billing.auto_topup_*`, but verbose. |

**Recommendation: `invoice.created`.** It's the shortest name a user would guess, and
opens a new `Invoice` webhook group we'll want anyway for part 2
(`invoice.paid`, `invoice.voided`). If the Stripe collision bothers us,
`invoice.generated` is the safe second.

### 2. Payload

`POST` to the org's webhook URL. Amounts in **dollars**, matching `invoices.list`.

Every field below is a real column on `invoice_line_items`
(`shared/models/cusModels/invoiceModels/invoiceLineItemModels.ts`) except `entity_id`,
which is derived (see the blocker after the example). `period_start`/`period_end` are
`effective_period_start`/`_end` renamed for the public shape.

Worked example: a Mintlify enterprise customer provisioned through AWS, billed monthly
for AI credits across docs deployments. August period, invoiced 1 Sep.

```jsonc
{
  "object": "invoice.created",
  "id": "inv_2b3c4d5e6f7g8h",
  "stripe_id": "in_1A2B3C4D5E6F7G8H",
  "processor_type": "stripe",
  "status": "open",
  "currency": "usd",
  "total": 4505.00,
  "amount_paid": null,
  "refunded_amount": 0,
  "plan_ids": ["enterprise"],
  "created_at": 1788220800000,
  "hosted_invoice_url": "https://api.useautumn.com/invoices/hosted_invoice_url/inv_2b3c4d5e6f7g8h",

  "customer_id": "acme_corp",
  "entity_id": null,   // invoice-level entity; null because this invoice spans deployments

  "line_items": [
    {
      "id": "invoice_li_7h2k9",
      "description": "Enterprise plan",
      "entity_id": null,              // customer-level, not tied to a deployment
      "product_id": "enterprise",
      "price_id": "pr_base_ent",
      "feature_id": null,
      "total_quantity": null,
      "paid_quantity": null,
      "amount": 2400.00,
      "amount_after_discounts": 2400.00,
      "currency": "usd",
      "period_start": 1785542400000,  // 2026-08-01
      "period_end": 1788220800000,    // 2026-09-01
      "billing_timing": "in_advance",
      "direction": "charge",
      "prorated": false,
      "discounts": []
    },
    {
      "id": "invoice_li_4m8p1",
      "description": "AI credits",
      "entity_id": "acme-docs-prod",  // = Mintlify's own deployment id
      "product_id": "enterprise",
      "price_id": "pr_ai_credits",
      "feature_id": "ai_credits",
      "total_quantity": 1842000,      // credits used this period
      "paid_quantity": 842000,        // the overage → meter this to AWS
      "amount": 1684.00,
      "amount_after_discounts": 1684.00,
      "currency": "usd",
      "period_start": 1785542400000,
      "period_end": 1788220800000,
      "billing_timing": "in_arrear",
      "direction": "charge",
      "prorated": false,
      "discounts": []
    },
    {
      "id": "invoice_li_9q3r7",
      "description": "AI credits",
      "entity_id": "acme-api-docs",
      "product_id": "enterprise",
      "price_id": "pr_ai_credits",
      "feature_id": "ai_credits",
      "total_quantity": 1210500,
      "paid_quantity": 210500,
      "amount": 421.00,
      "amount_after_discounts": 421.00,
      "currency": "usd",
      "period_start": 1785542400000,
      "period_end": 1788220800000,
      "billing_timing": "in_arrear",
      "direction": "charge",
      "prorated": false,
      "discounts": []
    }
  ],

  "discounts": []
}
```

**Mintlify's loop:** filter `line_items` to those with an `entity_id` and a
`feature_id`, post `paid_quantity` to Suger → AWS keyed on their own deployment id,
then mark the invoice paid out of band (part 2). `stripe_id` is the dedupe key.

`entity_id` is Mintlify's own deployment id — they create the entity with it — so the
missing `metadata` column on entities doesn't block them. They join on their side.

#### Field notes

- `billing_timing` is nullable. It's populated from Autumn billing context, but set to
  `null` for lines we only know from Stripe
  (`stripeLineItemGroupToDbLineItems.ts:372`), e.g. a manually added invoice item.
- `total_quantity` / `paid_quantity` are nullable and are `null` on fixed-fee lines.
- `direction` is `"charge" | "refund"`. Refund lines carry negative amounts — Mintlify
  should skip or subtract them rather than metering them.
- `description_source` (`"stripe" | "autumn"`) exists but isn't worth exposing; it just
  says whether we or Stripe wrote the description string.

#### Decisions applied

- `included_quantity` **dropped** — not a stored column.
- `entity_metadata` **dropped** — entities have no `metadata` column; `entity_id` carries
  the join.
- `entity_breakdown` **dropped** — consumers can group `line_items` themselves.
- Amounts in **dollars** throughout.

### The blocker: one line item can span several entities

`entity_id` is not a column. It has to come from
`customer_product_ids[]` → `customer_products.internal_entity_id`, and that field is an
**array** on purpose. From the code's own example
(`stripeLineItemGroupToDbLineItems.ts:27`):

> One Stripe line item can match multiple Autumn line items (e.g., when 2 entities each
> have a $20 base price merged into one $40 Stripe item).

When that happens the quantities are **summed** into the single row
(`:210-220`, `reduce((sum, li) => sum + li.paidQuantity)`). So the merged row has one
amount, one `paid_quantity`, and *n* entities — the per-entity split is gone by the time
it's stored. That is exactly the number Mintlify needs.

The per-entity values do exist upstream: each Autumn `LineItem` carries its own
`context.entity` and its own `totalQuantity`/`paidQuantity`
(`shared/models/billingModels/lineItem/lineItemContext.ts`), before the reduce.

**Options:**

1. **Write one `invoice_line_items` row per entity** instead of merging, keeping the
   Stripe line id shared across them. `entity_id` becomes singular and honest, and the
   webhook is a straight projection. Touches reconciliation
   (`reconcileMany.ts`) and the `stripe_id` unique constraint, which assumes one row
   per Stripe line — this is the real cost.
2. **Emit `entity_ids: string[]`** on the line item and leave the split to the consumer.
   Cheap, but Mintlify can't split a merged amount, so it doesn't actually solve their
   problem.

Recommend option 1, scoped to usage/arrear lines where this matters. Worth confirming
first whether Mintlify's per-deployment AI credit prices actually merge today — if each
deployment lands on its own Stripe subscription item, `customer_product_ids` is length 1
throughout and option 1 is a no-op for them.

### The scale problem

`getFullSubjectRowsQuery.ts:27` records a Mintlify customer with **12,212 entities**.
An invoice for a customer like that, with one arrear line per deployment, is a
`line_items` array in the thousands — a multi-MB webhook body, and a delivery that
will time out or get rejected long before it's useful.

Only entities that actually incurred a charge produce a line, which trims it, but not
reliably enough to ignore. Proposal:

- Inline the first **100** line items.
- Add `line_items_count` and `line_items_truncated: true`.
- Page the remainder from `GET /invoices/:id/line_items` (cursor-paginated, same
  shape), which we want anyway so webhook deliveries are replayable.

Consumers with small invoices never notice; Mintlify's big ones stay deliverable.

### Another caveat worth naming

A deployment that stayed **under** its allowance produces no line item at all — Stripe
never creates a zero line. So `line_items` covers *billed* entities, not all
entities. That's correct for metering (nothing to post), but if Mintlify wants a
zero-usage record per deployment they'd need to source that from `entities.list`, not
from this webhook.

### Fire timing

On Stripe's `invoice.finalized`, not `invoice.created`. Arrear usage isn't reconciled
in the draft, so overage numbers can still move — and the overage is the whole point.
Holds regardless of what we name our event.

### Also worth shipping alongside

Expose the same `line_items` on `invoices.list` / `invoices.get` (uncomment and
extend `processInvoice`) so the webhook and the API agree, and replays are possible.

---

## Part 2 — Mark invoice paid out of band

*Spec after part 1 is agreed.* Shape: `autumn.invoices.markPaid({ invoice_id })` →
Stripe `invoices.pay(id, { paid_out_of_band: true })`, invoice moves to `paid`,
`amount_paid` set, no charge attempted. Precedent already exists for the Vercel
marketplace (`server/src/external/vercel/misc/vercelInvoicing.ts:34`).
