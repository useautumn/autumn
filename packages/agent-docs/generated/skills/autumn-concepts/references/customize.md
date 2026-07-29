# Customize

`customize` is a patch over a catalog plan. Use it for customer-specific terms, variant definitions, plan update previews, migration drafts, and catalog update previews.

## Rules

- Base price changes go in `customize.price`.
- Plan item changes are PATCH-style: use `add_items` and `remove_items` in API params.
- Avoid full `items` replacement unless the API or config workflow specifically requires it.
- Each remove entry is a filter. Include `billing_method`, `interval`, or `interval_count` when `feature_id` alone could match multiple items.
- Replace an item by removing the old item and adding the new one in the same patch.
- Prefer the smallest diff that preserves the plan's existing structure.

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
