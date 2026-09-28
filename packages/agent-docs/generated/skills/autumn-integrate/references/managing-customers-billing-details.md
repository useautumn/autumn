## Billing Details

Billing details are the tax and invoicing fields stored on the customer's linked Stripe customer: billing address, tax IDs (e.g. VAT), tax exemption, and custom fields printed on every invoice (e.g. a PO number). Autumn doesn't store them; it writes them to Stripe and reads them back live.

| Field | Behaviour |
| --- | --- |
| `address` | Replaces the whole address, as in Stripe. `null` clears it. |
| `tax_ids` | `add` and `remove` lists. Tax IDs you don't list are kept. Stripe tax IDs can't be edited, so to change one, remove the old ID and add the new one. |
| `tax_exempt` | `none`, `exempt`, or `reverse` (reverse charge). |
| `invoice_settings.custom_fields` | Up to 4 `{ name, value }` pairs shown on every invoice. Replaces the existing list; `null` clears it. |

<CodeGroup>

```typescript TypeScript
await autumn.customers.update({
  customerId: "user_123",
  billingDetails: {
    address: { line1: "1 Main St", city: "Berlin", postalCode: "10115", country: "DE" },
    taxIds: {
      add: [{ type: "eu_vat", value: "DE123456789" }],
      remove: [{ type: "gb_vat", value: "GB123456789" }],
    },
    taxExempt: "reverse",
    invoiceSettings: { customFields: [{ name: "PO Number", value: "PO-10042" }] },
  },
});
```

```python Python
await autumn.customers.update(
    customer_id="user_123",
    billing_details={
        "address": {"line1": "1 Main St", "city": "Berlin", "postal_code": "10115", "country": "DE"},
        "tax_ids": {
            "add": [{"type": "eu_vat", "value": "DE123456789"}],
            "remove": [{"type": "gb_vat", "value": "GB123456789"}],
        },
        "tax_exempt": "reverse",
        "invoice_settings": {"custom_fields": [{"name": "PO Number", "value": "PO-10042"}]},
    },
)
```

```bash cURL
curl -X POST "https://api.useautumn.com/v1/customers/update" \
  -H "Authorization: Bearer $AUTUMN_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "billing_details": {
      "address": { "line1": "1 Main St", "city": "Berlin", "postal_code": "10115", "country": "DE" },
      "tax_ids": {
        "add": [{ "type": "eu_vat", "value": "DE123456789" }],
        "remove": [{ "type": "gb_vat", "value": "GB123456789" }]
      },
      "tax_exempt": "reverse",
      "invoice_settings": { "custom_fields": [{ "name": "PO Number", "value": "PO-10042" }] }
    }
  }'
```

</CodeGroup>

To read them back, add `billing_details` to `expand` when fetching the customer. It returns `null` when no Stripe customer is linked.

```typescript
const customer = await autumn.customers.get({
  customerId: "user_123",
  expand: ["billing_details"],
});
```

You can also pass `billing_details` when creating a customer; Autumn creates the Stripe customer if needed. On update, the customer must already be linked to a Stripe customer.

  Invalid values (for example a malformed VAT number) are rejected with Stripe's
  error message, and changes from the same request are not left half-applied.

In the dashboard, billing details are under **Edit customer** on the customer's page.

#### Deleting a Customer

To delete a customer:

1. Go to the customer's details page
2. Click the "Settings" icon in the top right
3. Click "Delete"

  Deleting a customer will not delete it in Stripe. If they have existing
  subscriptions, you should cancel them from Stripe if needed.
