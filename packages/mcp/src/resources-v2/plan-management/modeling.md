<modeling>

- Help the user map their pricing onto Autumn's model; give best-practice advice.

  <variants>

  - Variants (monthly vs yearly, or two price points of the same plan) are separate plans, e.g. `pro_monthly` and `pro_annual` — Autumn has no single "plan with variants".

  </variants>

  <per-plan-metered>

  - A metered allowance sold per plan (e.g. email volume, credits) is an item under each plan, not its own plan.
  - When each plan sells a different amount of that feature at a different price point, use a prepaid volume-priced item per plan: the same feature, with plan-specific `included` (free amount) and `tier_behavior: "volume"` tiers `{ amount: 0, to, flat_amount }`. `to` is the total quantity at that tier, including the free `included`. Add a usage-based overage item if usage beyond the top bucket should bill in arrears.

  ```json
  [
    {
      "id": "pro",
      "name": "Pro",
      "price": { "amount": 20, "interval": "month" },
      "items": [
        {
          "feature_id": "credits",
          "included": 1000, // 1,000 credits/month free
          "reset": { "interval": "month" },
          "price": {
            "tiers": [
              { "to": 2000, "amount": 0, "flat_amount": 200 }, // $200 for 2,000 total (1k free + 1k paid)
              { "to": "inf", "amount": 0, "flat_amount": 400 } // $400 for any amount above 2,000
            ],
            "tier_behavior": "volume",
            "interval": "month",
            "billing_units": 1,
            "billing_method": "prepaid"
          }
        }
      ]
    },
    {
      "id": "scale",
      "name": "Scale",
      "price": { "amount": 50, "interval": "month" },
      "items": [
        {
          "feature_id": "credits",
          "included": 5000, // 5,000 credits/month free
          "reset": { "interval": "month" },
          "price": {
            "tiers": [
              { "to": 10000, "amount": 0, "flat_amount": 300 }, // $300 for 10,000 total (5k free + 5k paid)
              { "to": "inf", "amount": 0, "flat_amount": 500 } // $500 for any amount above 10,000
            ],
            "tier_behavior": "volume",
            "interval": "month",
            "billing_units": 1,
            "billing_method": "prepaid"
          }
        }
      ]
    }
  ]
  ```

  </per-plan-metered>

  <shared-meter>

  - When several actions/endpoints draw from one shared meter (e.g. many API endpoints, or generic "credits"), model one `credit_system` feature the actions map into, granted once per plan; usage deducts from the shared balance.
  - Example (Exa-style): each endpoint maps 1:1 into a `requests` credit_system; a plan grants the included amount, and once exhausted, usage deducts from the shared credits balance.

  </shared-meter>

  <trials>

  - For a no-card trial of a paid plan, it's usually better to create a separate free plan that mirrors the paid plan and carries the trial — a "limited-time trial" — rather than putting `free_trial` (`card_required: false`) on the paid plan itself. It grants temporary access, expires automatically, then routes the user into the paid plan's normal checkout.
  - See the Plan concept's `<trial-behavior>` for the reasoning, and the Trials concept for the full flow.

  </trials>

</modeling>
