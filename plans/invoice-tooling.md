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

`POST` to the org's webhook URL. All amounts in **dollars**, matching `invoices.list`
(not cents — `billing.auto_topup_succeeded` is the odd one out and we should leave it).

Worked example: a Mintlify enterprise customer provisioned through AWS, billed monthly
for AI credits across three docs deployments. August period, invoiced 1 Sep.

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
  "period_start": 1785542400000,   // 2026-08-01
  "period_end": 1788220800000,     // 2026-09-01
  "hosted_invoice_url": "https://api.useautumn.com/invoices/hosted_invoice_url/inv_2b3c4d5e6f7g8h",

  "customer": {
    "id": "acme_corp",
    "name": "Acme Corp",
    "metadata": { "provisioned_through": "aws", "suger_buyer_id": "buy_9f21" }
  },
  "entity_id": null,   // invoice-level entity; null because this invoice spans deployments

  // Every line on the invoice, each tagged with the entity it belongs to.
  "line_items": [
    {
      "id": "ili_7h2k9",
      "description": "Enterprise plan",
      "entity_id": null,             // customer-level, not tied to a deployment
      "plan_id": "enterprise",
      "feature_id": null,
      "total_quantity": null,
      "paid_quantity": 1,
      "amount": 2400.00,
      "amount_after_discounts": 2400.00,
      "currency": "usd",
      "period_start": 1785542400000,
      "period_end": 1788220800000,
      "billing_timing": "in_advance",
      "direction": "charge",
      "prorated": false
    },
    {
      "id": "ili_4m8p1",
      "description": "AI credits",
      "entity_id": "acme-docs-prod",  // = Mintlify's own deployment id
      "plan_id": "enterprise",
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
      "prorated": false
    },
    {
      "id": "ili_9q3r7",
      "description": "AI credits",
      "entity_id": "acme-api-docs",
      "plan_id": "enterprise",
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
      "prorated": false
    }
  ],

  // Same numbers as line_items, pre-grouped by entity so the consumer doesn't
  // have to fold them. Purely a convenience view — nothing here is new data.
  "entity_breakdown": [
    {
      "entity_id": null,
      "entity_name": null,
      "total": 2400.00,
      "features": []
    },
    {
      "entity_id": "acme-docs-prod",
      "entity_name": "Acme Docs (prod)",
      "entity_feature_id": "deployments",
      "total": 1684.00,
      "features": [
        { "feature_id": "ai_credits", "total_quantity": 1842000, "paid_quantity": 842000, "amount": 1684.00 }
      ]
    },
    {
      "entity_id": "acme-api-docs",
      "entity_name": "Acme API Reference",
      "entity_feature_id": "deployments",
      "total": 421.00,
      "features": [
        { "feature_id": "ai_credits", "total_quantity": 1210500, "paid_quantity": 210500, "amount": 421.00 }
      ]
    }
  ],

  "discounts": []
}
```

**Mintlify's loop:** for each `entity_breakdown` entry with an `entity_id`, post
`paid_quantity` for `ai_credits` to Suger → AWS, keyed on their own deployment id.
`stripe_id` is the dedupe key. Then mark the invoice paid out of band (part 2).

Note `entity_id` is Mintlify's own deployment id — they create the entity with it — so
the missing `metadata` column on entities doesn't block this. They join on their side.

#### Decisions applied

- `included_quantity` **dropped**. Not on `invoice_line_items`; `total_quantity` −
  `paid_quantity` gets you there for the common case.
- `entity_metadata` **dropped from v1**. Entities have no `metadata` column yet;
  `entity_id` carries the join.
- Amounts in **dollars** throughout.
- `entity_breakdown` **kept** — see the note above on what it is.

### The scale problem

`getFullSubjectRowsQuery.ts:27` records a Mintlify customer with **12,212 entities**.
An invoice for a customer like that, with one arrear line per deployment, is a
`line_items` array in the thousands — a multi-MB webhook body, and a delivery that
will time out or get rejected long before it's useful.

Only entities that actually incurred a charge produce a line, which trims it, but not
reliably enough to ignore. Proposal:

- Inline the first **100** line items and the matching `entity_breakdown` entries.
- Add `line_items_count` and `line_items_truncated: true`.
- Page the remainder from `GET /invoices/:id/line_items` (cursor-paginated, same
  shape), which we want anyway so webhook deliveries are replayable.

Consumers with small invoices never notice; Mintlify's big ones stay deliverable.

### Another caveat worth naming

A deployment that stayed **under** its allowance produces no line item at all — Stripe
never creates a zero line. So `entity_breakdown` covers *billed* entities, not all
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
