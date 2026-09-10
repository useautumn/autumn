# Licenses

A license lets a parent plan hand out another plan per seat. "Team is $40/seat, each seat gets 100 summaries" → the seat is its own plan, and the team plan offers it through a license.

## The three objects

- **Child plan** — the actual product for the child: an ordinary plan whose items are what one seat gets. It needs its own `group`, otherwise attaching it would replace its parent.
- **License** — the link plus the customized definition: the parent's `licenses: [{ license_plan_id, included }]` entry. `included` is how many seats come free with the parent. The license can also customize the child *for this parent only* — a different price, items added or removed — while the child plan itself stays shared.
- **CustomerLicense** — the runtime record per customer: how many seats they have (`granted` = included + paid), how many are assigned to entities, how many are free. Its identity (`link_id`) is stable across plan versions, so seats never jump around when plans change.

```json
{
  "plan_id": "team",
  "licenses": [
    {
      "license_plan_id": "seat",
      "included": 2,
      "customize": { "price": { "amount": 40, "interval": "month" } }
    }
  ]
}
```

## Why the license is a customization, not a copy

The child plan is defined once; each parent's license describes its own take on it. That buys three things:

- **Sharing** — Team and Enterprise can both offer `seat`, one at $40 and one at $30, without two seat plans:

```json
[
  { "plan_id": "team", "licenses": [{ "license_plan_id": "seat", "included": 2 }] },
  { "plan_id": "scale", "licenses": [{ "license_plan_id": "seat", "included": 2, "customize": { "price": { "amount": 30, "interval": "month" } } }] }
]
```

- **Propagation** — edit the child (add a boolean feature to `seat`) and the change can follow upward to every parent that offers it. Each parent chooses: follow the update, or pin its current version. A parent's own declared customize wins over what propagates.
- **Clean transitions** — a customer moving from Team to Scale, both offering `seat`: each seat assignment carries over intuitively, because the license identity is stable and both parents point at the same child.

A license's customize can change the price and add/remove items — nothing else, and licenses don't nest (a child plan can't offer licenses of its own).

## How seats move

- **Buy** — seat count is set on the *parent* (`license_quantities` on attach/update). The quantity is the total, including the free `included` seats. Buying a priced license attaches it at the customer level automatically.
- **Assign** — `licenses.attach` gives a seat to an entity (creating it if you pass a `feature_id`). Idempotent; errors when no seats are free.
- **Release** — `licenses.release` frees the seat. It does **not** change what the customer pays — they still own the seat, it's just unassigned.

Empty seats are normal — that's the point: capacity is bought before you know who fills it.

## When licenses are the right model

One question: **does a seat grant anything?** A seat that carries its own allowance or plan → license. Seats that are only a count you bill → per-unit priced item, no entities. Entities that appear one by one, each picking its own plan → attach plans per entity, no license.

## Not yet available

- Overflow billing (`prepaid_only: false` — auto-billing seats beyond the bought pool) is not available yet.
- License plans can't contain pooled items.
