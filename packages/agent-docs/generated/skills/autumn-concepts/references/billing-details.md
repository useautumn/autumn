### Billing Details

- Billing details are the tax and invoicing fields on the customer's linked Stripe customer: billing address, tax IDs (VAT, GST…), tax exemption, and invoice custom fields (e.g. a PO number). Autumn doesn't store them — writes go straight to Stripe and reads come back live.
- Set them with `billing_details` on `customers.create` or `customers.update`; read them with `expand: ["billing_details"]` on `customers.get` (`null` when no Stripe customer is linked).
- Update requires a linked Stripe customer. Create makes the Stripe customer if needed.

</intro>

<fields>

- `address`: `{ line1, line2, city, state, postal_code, country }`. **Replaces the whole address**, as Stripe does — to change one line, send the full address. `null` clears it.
- `tax_ids`: `{ add?: [{ type, value }], remove?: [{ type, value }] }`. IDs not listed are kept; adding one that exists or removing one that doesn't is a no-op. Stripe tax IDs can't be edited — to change a VAT number, remove the old one and add the new one in the same call. `type` is Stripe's tax ID type (`eu_vat`, `gb_vat`, `us_ein`, …).
- `tax_exempt`: `none`, `exempt`, or `reverse` (reverse charge).
- `invoice_settings.custom_fields`: up to 4 `{ name, value }` pairs printed on every invoice (name ≤ 40 chars, value ≤ 140). **Replaces the whole list** — to add one, send the existing ones too. `null` clears it.

</fields>

<gotchas>

- Address and custom fields replace; tax IDs don't. Before changing an address line or adding a custom field, read the current values with the expand and send them back alongside the change.
- Invalid values (a malformed VAT number) fail with Stripe's error, and the request leaves nothing half-applied — no tax ID, address, or email change from that call lands.

</gotchas>

<useful-docs>

- Billing details: https://docs.useautumn.com/documentation/customers/managing-customers#billing-details

</useful-docs>
