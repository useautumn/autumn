<customizations>

- Use the `customize` object for customer-specific plan terms.
- Base price changes go in `customize.price`; e.g. if the user says Pro is $50/month but the catalog Pro plan is $20/month, customize the price.
- A bare number with an interval but no `$` and no unit (e.g. "1k/yr", "2k/mo") is ambiguous between `customize.price` and a feature quantity (credits/seats); clarify which before building the customize, and read the same pattern consistently across the request.
- Plan item changes can be PUT-style or PATCH-style.
  - PUT-style: `customize.items` replaces the full item set.
  - PATCH-style: `customize.add_items` and `customize.remove_items` change selected items.
- Each `remove_items` entry is a filter for items to remove from the plan.
- Include `billing_method`, `interval`, or `interval_count` in the filter when `feature_id` alone could match multiple items.
- Prefer PATCH-style. Use PUT-style only when the user intends to replace the entire plan item set.
- Do not use `update_items`.
- If any customization is inferred, surface it to the user for confirmation before previewing or writing.
- Replace an item's configuration: remove the old item and add the new version in the same PATCH-style `customize`.
- If a plan name/id/context suggests an Enterprise or custom placeholder plan and the plan has no base price, and no commercial terms were specified, ask the user whether they want to customize the base price.

Use cases:

- `updateSubscription`: customize the plan configuration the customer is already on.
  ```json
  {
    "customer_id": "cus_123",
    "plan_id": "pro",
    "customize": { "add_items": [{ "feature_id": "sso", "unlimited": true }] }
  }
  ```

- `attach`: attach a plan with customer-specific base price or item changes.
  ```json
  {
    "customer_id": "cus_123",
    "plan_id": "pro",
    "customize": {
      "price": { "amount": 50, "interval": "month" },
      "add_items": [{ "feature_id": "credits", "included": 5000 }]
    }
  }
  ```

- `createSchedule`: customize the plan inside the phase that needs custom terms.
  ```json
  {
    "customer_id": "cus_123",
    "phases": [
      { "starts_at": "now", "plans": [{ "plan_id": "pro" }] },
      {
        "starts_at": "2027-06-12T00:00:00Z",
        "plans": [
          {
            "plan_id": "pro",
            "customize": { "price": { "amount": 75, "interval": "month" } }
          }
        ]
      }
    ]
  }
  ```

Examples:

- Change base price:
  ```json
  { "customize": { "price": { "amount": 50, "interval": "month" } } }
  ```

- Add a boolean feature:
  ```json
  { "customize": { "add_items": [{ "feature_id": "sso", "unlimited": true }] } }
  ```

- Remove a feature:
  ```json
  { "customize": { "remove_items": [{ "feature_id": "audit_logs" }] } }
  ```

- Change included amount:
  ```json
  {
    "customize": {
      "remove_items": [{ "feature_id": "credits" }],
      "add_items": [{ "feature_id": "credits", "included": 5000 }]
    }
  }
  ```

- Change included amount and reset interval:
  ```json
  {
    "customize": {
      "remove_items": [{ "feature_id": "credits" }],
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

- Change only the monthly item when the same feature also has a lifetime item:
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

- Change prepaid to usage-based:
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

</customizations>
