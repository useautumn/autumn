# atmn Variants Schema

## Decision

Variants should be nested under their base `plan(...)` and represented as patches from the base plan.

The variant object has top-level metadata only:

- `id`
- `name`

All inherited-plan differences live under `customize`.

This keeps the atmn DSL close to the API model instead of inventing a separate config-only abstraction.

## Proposed atmn Shape

```ts
import { feature, item, itemFilter, plan, variant } from "atmn";

export const messages = feature({
	id: "messages",
	name: "Messages",
	type: "metered",
	consumable: true,
});

export const dashboard = feature({
	id: "dashboard",
	name: "Dashboard",
	type: "boolean",
});

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: { amount: 49, interval: "month" },
	items: [
		item({
			featureId: messages.id,
			included: 5000,
			reset: { interval: "month" },
		}),
		item({ featureId: dashboard.id }),
	],
	variants: [
		variant({
			id: "pro_annual",
			name: "Pro Annual",
			customize: {
				price: { amount: 500, interval: "year" },
				removeItems: [
					itemFilter({
						featureId: messages.id,
						interval: "month",
					}),
				],
				addItems: [
					item({
						featureId: messages.id,
						included: 10000,
						reset: { interval: "year" },
					}),
				],
			},
		}),
	],
});
```

## Schema Semantics

```ts
type Variant = {
	id: string;
	name: string;
	customize?: CustomizePlan;
};

type CustomizePlan = {
	price?: BasePrice | null;
	items?: PlanItem[];
	addItems?: PlanItem[];
	removeItems?: PlanItemFilter[];
	freeTrial?: FreeTrial | null;
	billingControls?: CustomerBillingControls;
};
```

Rules:

- `variants` is a field on `Plan`.
- `variant(...)` is a thin builder, like `plan(...)` and `item(...)`.
- `customize` maps directly to `CustomizePlanV1`, using camelCase in atmn and snake_case at the API boundary.
- `customize.items` is PUT-style full item replacement.
- `customize.addItems` and `customize.removeItems` are PATCH-style operations.
- `customize.items` cannot be combined with `addItems` or `removeItems`.
- Updating an item identity, such as `Messages 5k/month -> Messages 10k/year`, is represented as `removeItems + addItems`.
- Do not introduce atmn-only `replaceItem` / `items.replace` for v1.

## API Mapping

Creating a variant:

```ts
{
	base_plan_id: "pro",
	variant_plan_id: "pro_annual",
	name: "Pro Annual"
}
```

Applying the variant patch:

```ts
{
	plan_id: "pro_annual",
	price: { amount: 500, interval: "year" },
	remove_items: [
		{ feature_id: "messages", interval: "month" }
	],
	add_items: [
		{
			feature_id: "messages",
			included: 10000,
			reset: { interval: "year" }
		}
	]
}
```

## Deferred

- `replace_items` / targeted item replacement as an API primitive.
- Top-level variant `price`, `items`, or `freeTrial` sugar.
- Full resolved variant plan definitions in config.
- Automatic propagation policy in atmn push.
