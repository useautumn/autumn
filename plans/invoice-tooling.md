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

`POST` to the org's webhook URL, `WebhookEventType.InvoiceCreated`, registered in
`shared/api/webhooks/webhookRegistry.ts` under a new `Invoice` group.

```jsonc
{
  "object": "invoice.created",
  "id": "inv_2b3c4d5e6f7g8h",
  "customer_id": "mintlify_acme",
  "entity_id": null,              // invoice-level entity, null when invoice spans entities
  "stripe_id": "in_1A2B3C4D5E6F7G8H",
  "processor_type": "stripe",
  "status": "open",
  "currency": "usd",
  "total": 2450.00,
  "amount_paid": null,
  "refunded_amount": 0,
  "plan_ids": ["enterprise"],
  "created_at": 1789689600000,
  "period_start": 1787011200000,  // earliest line-item period on the invoice
  "period_end": 1789689600000,
  "hosted_invoice_url": "https://api.useautumn.com/invoices/hosted_invoice_url/inv_2b3c4d5e6f7g8h",

  "customer": {
    "id": "mintlify_acme",
    "name": "Acme Corp",
    "metadata": { "provisioned_through": "aws" }   // where Suger/AWS ids live
  },

  // Flat list — every line on the invoice, each tagged with its entity.
  "line_items": [
    {
      "id": "ili_01",
      "description": "AI credits (overage)",
      "entity_id": "deployment_us_east",
      "plan_id": "enterprise",
      "feature_id": "ai_credits",
      "total_quantity": 1500000,      // total usage in the period
      "included_quantity": 1000000,   // covered by the plan
      "paid_quantity": 500000,        // the overage — what gets metered to AWS
      "amount": 1000.00,
      "amount_after_discounts": 1000.00,
      "currency": "usd",
      "period_start": 1787011200000,
      "period_end": 1789689600000,
      "prorated": false,
      "direction": "charge"
    },
    {
      "id": "ili_02",
      "description": "AI credits (overage)",
      "entity_id": "deployment_eu_west",
      "plan_id": "enterprise",
      "feature_id": "ai_credits",
      "total_quantity": 1200000,
      "included_quantity": 1000000,
      "paid_quantity": 200000,
      "amount": 400.00,
      "amount_after_discounts": 400.00,
      "currency": "usd",
      "period_start": 1787011200000,
      "period_end": 1789689600000,
      "prorated": false,
      "direction": "charge"
    },
    {
      "id": "ili_03",
      "description": "Enterprise plan",
      "entity_id": null,              // customer-level line, not entity-scoped
      "plan_id": "enterprise",
      "feature_id": null,
      "total_quantity": null,
      "included_quantity": null,
      "paid_quantity": 1,
      "amount": 1050.00,
      "amount_after_discounts": 1050.00,
      "currency": "usd",
      "period_start": 1787011200000,
      "period_end": 1789689600000,
      "prorated": false,
      "direction": "charge"
    }
  ],

  // Pre-rolled-up view. Same numbers as line_items, grouped so the consumer
  // doesn't have to. Entity-less lines land under entity_id: null.
  "entity_breakdown": [
    {
      "entity_id": "deployment_us_east",
      "entity_name": "US East",
      "entity_feature_id": "deployments",
      "entity_metadata": { "aws_customer_id": "abc123" },
      "total": 1000.00,
      "features": [
        {
          "feature_id": "ai_credits",
          "total_quantity": 1500000,
          "included_quantity": 1000000,
          "paid_quantity": 500000,
          "amount": 1000.00
        }
      ]
    },
    {
      "entity_id": "deployment_eu_west",
      "entity_name": "EU West",
      "entity_feature_id": "deployments",
      "entity_metadata": { "aws_customer_id": "def456" },
      "total": 400.00,
      "features": [
        {
          "feature_id": "ai_credits",
          "total_quantity": 1200000,
          "included_quantity": 1000000,
          "paid_quantity": 200000,
          "amount": 400.00
        }
      ]
    },
    {
      "entity_id": null,
      "entity_name": null,
      "entity_feature_id": null,
      "entity_metadata": null,
      "total": 1050.00,
      "features": []
    }
  ],

  "discounts": []
}
```

**Does this cover Mintlify?** Per deployment, per feature, for the billing period:
`paid_quantity` (the overage to meter), `total_quantity` (usage), and `amount`.
Plus `entity_metadata` to carry the AWS/Suger id they said they'd tag on the entity,
and `stripe_id` as a dedupe key. That's the whole AWS Marketplace post.

### Open questions

- **`included_quantity`** isn't on `invoice_line_items` today — derived from the
  customer entitlement at invoice time, or dropped from v1?
- **Entity metadata** — `entities` has no `metadata` column yet (the other half of
  Ryan's ask). Ships with this or separately; if separately, `entity_metadata` is
  `null` in v1 and they key off `entity_id`.
- **`entity_breakdown` — do we need it?** It's derivable from `line_items`. Keep if
  we think most consumers want the rollup; drop to halve the payload.
- **Fire timing** — on Stripe `invoice.finalized` (amounts final, arrear usage
  reconciled) vs `invoice.created` (draft, amounts can still move). Finalized is the
  correct trigger regardless of what we name the event.
- **Amount units** — list API returns dollars; `billing.auto_topup_succeeded` returns
  cents. Pick one and document it loudly.

### Also worth shipping alongside

Expose the same `line_items` on `invoices.list` / `invoices.get` (uncomment and
extend `processInvoice`) so the webhook and the API agree, and replays are possible.

---

## Part 2 — Mark invoice paid out of band

*Spec after part 1 is agreed.* Shape: `autumn.invoices.markPaid({ invoice_id })` →
Stripe `invoices.pay(id, { paid_out_of_band: true })`, invoice moves to `paid`,
`amount_paid` set, no charge attempted. Precedent already exists for the Vercel
marketplace (`server/src/external/vercel/misc/vercelInvoicing.ts:34`).
