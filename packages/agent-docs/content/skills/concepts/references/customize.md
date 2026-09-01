# Customize

`customize` is a patch over a catalog plan. Use it for customer-specific terms, variant definitions, plan update previews, migration drafts, and catalog update previews.

## Rules

- Base price changes go in `customize.price`.
- Plan item changes are PATCH-style: use `add_items` and `remove_items` in API params.
- An `add_items` entry is a full item definition, not a patch: read the item's fields (`pooled`, `reset`, `rollover`, …) off the plan first and restate every one you are not explicitly changing.
- Avoid full `items` replacement unless the API or config workflow specifically requires it.
- Each remove entry is a filter. Include `billing_method`, `interval`, or `interval_count` when `feature_id` alone could match multiple items.
- Taking a feature away is always `remove_items`, never an `add_items` entry with `included: 0` — that grants the feature with a zero allowance instead of withholding it, and a boolean feature has no allowance to set. "no approval chains", "without SSO", "0 seats" on a boolean all mean remove.
- Replace an item by removing the old item and adding the new one in the same patch.
- Prefer the smallest diff that preserves the plan's existing structure.
- When raising `included` on a tiered item, keep the ladder valid: every tier boundary (`to`) must be strictly greater than the new `included`. Drop or shift any boundary at or below it instead of zeroing its price.

## API examples

Change base price:

```json
{ "customize": { "price": { "amount": 50, "interval": "month" } } }
```

Add a boolean feature:

```json
{ "customize": { "add_items": [{ "feature_id": "sso" }] } }
```

Remove a feature:

```json
{ "customize": { "remove_items": [{ "feature_id": "audit_logs" }] } }
```

Change included amount:

```json
{
  "customize": {
    "remove_items": [{ "feature_id": "credits" }],
    "add_items": [{ "feature_id": "credits", "included": 5000 }]
  }
}
```

Change only the monthly item when the same feature also has a lifetime item:

```json
{
  "customize": {
    "remove_items": [
      {
        "feature_id": "credits",
        "billing_method": "prepaid",
        "interval": "month"
      }
    ],
    "add_items": [
      {
        "feature_id": "credits",
        "included": 5000,
        "reset": { "interval": "month" }
      }
    ]
  }
}
```

Change prepaid to usage-based:

```json
{
  "customize": {
    "remove_items": [{ "feature_id": "credits" }],
    "add_items": [
      {
        "feature_id": "credits",
        "included": 0,
        "price": {
          "amount": 0.01,
          "interval": "month",
          "billing_method": "usage_based"
        }
      }
    ]
  }
}
```
