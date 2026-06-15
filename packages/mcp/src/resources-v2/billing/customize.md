<customizations>

- Use the `customize` object for customer-specific plan terms.
- Base price changes go in `customize.price`; e.g. if the user says Pro is $50/month but the catalog Pro plan is $20/month, customize the price.
- A bare number with an interval but no `$` and no unit (e.g. "1k/yr", "2k/mo") is ambiguous between `customize.price` and a feature quantity (credits/seats); clarify which before building the customize, and read the same pattern consistently across the request.
- A list of what a customer "gets" is ambiguous: restating the plan, adding on top, or the exact set (items not listed are removed/zeroed). If the reading changes what they receive vs the catalog plan, ask which before building.
- "Features" may mean only some items (e.g. booleans) or include credits/metered items; clarify scope before removing anything priced.
- Plan item changes are always PATCH-style: `customize.add_items` and `customize.remove_items` change selected items.
- Never use `customize.items` (PUT-style full replacement) or `update_items`. To make the plan's items the exact set, remove the unwanted ones with `remove_items` and add the missing ones with `add_items`.
- Each `remove_items` entry is a filter for items to remove from the plan.
- Include `billing_method`, `interval`, or `interval_count` in the filter when `feature_id` alone could match multiple items.
- Replace an item's configuration: remove the old item and add the new version in the same PATCH-style `customize`.
- When the same outcome can be expressed multiple ways, prefer the customization that preserves the catalog plan's existing item structure: same-shape customizations keep the customer consistent with others on the plan and with their existing update/quantity flows.

  <example>
  A plan prices `credits` as a prepaid, volume-tiered item (ladder
  `10k=$90, 50k=$400, inf=$700`). To give a customer 20k credits at a custom
  $150/mo, add a `20k=$150` tier into the existing ladder:

  ```json
  {
    "customize": {
      "remove_items": [{ "feature_id": "credits", "billing_method": "prepaid" }],
      "add_items": [
        {
          "feature_id": "credits",
          "price": {
            "billing_method": "prepaid",
            "interval": "month",
            "tier_behavior": "volume",
            "tiers": [
              { "to": 10000, "flat_amount": 90 },
              { "to": 20000, "flat_amount": 150 },
              { "to": 50000, "flat_amount": 400 },
              { "to": "inf", "flat_amount": 700 }
            ]
          }
        }
      ]
    },
    "feature_quantities": [{ "feature_id": "credits", "quantity": 20000 }]
  }
  ```

  Note: the new tier is added into the plan's existing tiers — carry the whole
  ladder over; don't replace it with just the custom tier or a flat base price.
  </example>
  
- If a plan name/id/context suggests an Enterprise or custom placeholder plan and the plan has no base price, and no commercial terms were specified, ask the user whether they want to customize the base price.

Use cases:

- `updateSubscription`: customize the plan configuration the customer is already on.
  ```json
  {
    "customer_id": "cus_123",
    "plan_id": "pro",
    "customize": { "add_items": [{ "feature_id": "sso" }] }
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
  { "customize": { "add_items": [{ "feature_id": "sso" }] } }
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
