import { expect, test } from "bun:test";
import {
	ApiFeatureType,
	type ApiPlanV1,
	BILLING_CONTROL_KEYS,
	BillingInterval,
	diffPlanV1,
	diffPlanV1PreviewFields,
	PlanPreviousAttributesV0Schema,
	ResetInterval,
} from "@autumn/shared";

const plan = (overrides: Partial<ApiPlanV1>): ApiPlanV1 =>
	({
		id: "pro",
		name: "Pro",
		description: null,
		group: null,
		version: 1,
		add_on: false,
		auto_enable: false,
		price: null,
		items: [],
		created_at: 1,
		env: "sandbox",
		archived: false,
		base_variant_id: null,
		base_internal_product_id: null,
		config: { ignore_past_due: false },
		billing_controls: {},
		metadata: {},
		...overrides,
	}) as ApiPlanV1;

const planWithInternalIds = ({
	amount,
	included,
	priceId,
	entitlementId,
}: {
	amount: number;
	included: number;
	priceId: string;
	entitlementId: string;
}) =>
	plan({
		price: {
			amount,
			interval: BillingInterval.Month,
			price_id: priceId,
		},
		items: [
			{
				feature_id: "messages",
				included,
				unlimited: false,
				reset: { interval: ResetInterval.Month },
				price: null,
				entitlement_id: entitlementId,
			},
		],
	});

test("diffPlanV1PreviewFields returns item and customize preview fields", () => {
	const from = plan({
		items: [
			{
				feature_id: "messages",
				included: 100,
				unlimited: false,
				reset: { interval: ResetInterval.Month },
				price: null,
			},
		],
	});
	const to = plan({
		items: [
			{
				feature_id: "messages",
				included: 200,
				unlimited: false,
				reset: { interval: ResetInterval.Month },
				price: null,
			},
		],
	});

	const diff = diffPlanV1PreviewFields({ from, to });

	expect(diff.customize).toMatchObject({
		add_items: [{ feature_id: "messages", included: 200 }],
		remove_items: [{ feature_id: "messages", interval: "month" }],
	});
	expect(diff.item_changes.map((change) => change.action)).toEqual([
		"deleted",
		"created",
	]);
	expect(diff.previous_attributes).toBeNull();
});

test("diffPlanV1PreviewFields returns scalar previous attributes", () => {
	const diff = diffPlanV1PreviewFields({
		from: plan({ name: "Pro", group: "paid" }),
		to: plan({ name: "Pro Plus", group: "paid" }),
	});

	expect(diff.previous_attributes).toEqual({ name: "Pro" });
	expect(diff.customize).toBeNull();
	expect(diff.item_changes).toEqual([]);
});

test("diffPlanV1PreviewFields ignores generated item display fields", () => {
	const from = plan({
		items: [
			{
				feature_id: "messages",
				included: 1800,
				unlimited: false,
				reset: { interval: ResetInterval.Year },
				price: null,
				display: { primary_text: "1,800 Messages" },
			},
		],
	});
	const to = plan({
		items: [
			{
				feature_id: "messages",
				included: 1800,
				unlimited: false,
				reset: { interval: ResetInterval.Year },
				price: null,
			},
		],
	});

	const diff = diffPlanV1PreviewFields({ from, to });

	expect(diff.customize).toBeNull();
	expect(diff.previous_attributes).toBeNull();
	expect(diff.item_changes).toEqual([]);
});

test("diffPlanV1PreviewFields ignores joined item feature fields", () => {
	const from = plan({
		items: [
			{
				feature_id: "messages",
				feature: {
					id: "messages",
					name: "Messages",
					type: ApiFeatureType.SingleUsage,
				},
				included: 1800,
				unlimited: false,
				reset: { interval: ResetInterval.Year },
				price: null,
			},
		],
	});
	const to = plan({
		items: [
			{
				feature_id: "messages",
				included: 1800,
				unlimited: false,
				reset: { interval: ResetInterval.Year },
				price: null,
			},
		],
	});

	const diff = diffPlanV1PreviewFields({ from, to });

	expect(diff.customize).toBeNull();
	expect(diff.previous_attributes).toBeNull();
	expect(diff.item_changes).toEqual([]);
});

test("diffPlanV1 ignores internal price and entitlement ids", () => {
	const from = planWithInternalIds({
		amount: 20,
		included: 100,
		priceId: "price_old",
		entitlementId: "ent_old",
	});
	const to = planWithInternalIds({
		amount: 20,
		included: 100,
		priceId: "price_new",
		entitlementId: "ent_new",
	});

	expect(diffPlanV1({ from, to })).toEqual({});
});

test("diffPlanV1 does not emit internal ids with semantic changes", () => {
	const from = planWithInternalIds({
		amount: 20,
		included: 100,
		priceId: "price_old",
		entitlementId: "ent_old",
	});
	const to = planWithInternalIds({
		amount: 30,
		included: 200,
		priceId: "price_new",
		entitlementId: "ent_new",
	});

	const diff = diffPlanV1({ from, to });

	expect(diff.price).not.toHaveProperty("price_id");
	expect(diff.add_items?.[0]).not.toHaveProperty("entitlement_id");
});

test("billing_controls: skip_overage_billing false vs unset is not a change", () => {
	const from = plan({
		billing_controls: {
			spend_limits: [
				{ feature_id: "messages", enabled: true, overage_limit: 100 },
			],
		},
	});
	const to = plan({
		billing_controls: {
			spend_limits: [
				{
					feature_id: "messages",
					enabled: true,
					overage_limit: 100,
					skip_overage_billing: false,
				},
			],
		},
	});

	const diff = diffPlanV1PreviewFields({ from, to });

	expect(diff.previous_attributes).toBeNull();
});

test("billing_controls: skip_overage_billing true vs unset is a change", () => {
	const from = plan({
		billing_controls: {
			spend_limits: [
				{ feature_id: "messages", enabled: true, overage_limit: 100 },
			],
		},
	});
	const to = plan({
		billing_controls: {
			spend_limits: [
				{
					feature_id: "messages",
					enabled: true,
					overage_limit: 100,
					skip_overage_billing: true,
				},
			],
		},
	});

	const diff = diffPlanV1PreviewFields({ from, to });

	expect(diff.previous_attributes).toMatchObject({
		billing_controls: from.billing_controls,
	});
});

const createdLanes = {
	auto_topups: [
		{
			feature_id: "messages",
			enabled: true,
			threshold: 10,
			quantity: 100,
		},
	],
	spend_limits: [{ feature_id: "messages", enabled: true, overage_limit: 50 }],
	usage_limits: [
		{
			feature_id: "messages",
			enabled: true,
			limit: 1000,
			interval: ResetInterval.Month,
		},
	],
	usage_alerts: [
		{
			feature_id: "messages",
			enabled: true,
			threshold: 80,
			threshold_type: "usage_percentage" as const,
		},
	],
	overage_allowed: [{ feature_id: "messages", enabled: true }],
} as const;

for (const key of BILLING_CONTROL_KEYS) {
	test(`billing_controls: creating ${key} from unset omits the lane`, () => {
		const diff = diffPlanV1PreviewFields({
			from: plan({ billing_controls: {} }),
			to: plan({ billing_controls: { [key]: createdLanes[key] } }),
		});

		expect(diff.previous_attributes).toBeNull();
	});

	test(`billing_controls: creating ${key} from a null lane omits the lane`, () => {
		const diff = diffPlanV1PreviewFields({
			from: plan({
				billing_controls: { [key]: null } as ApiPlanV1["billing_controls"],
			}),
			to: plan({ billing_controls: { [key]: createdLanes[key] } }),
		});

		expect(diff.previous_attributes).toBeNull();
	});

	test(`billing_controls: creating ${key} from an empty array keeps []`, () => {
		const diff = diffPlanV1PreviewFields({
			from: plan({ billing_controls: { [key]: [] } }),
			to: plan({ billing_controls: { [key]: createdLanes[key] } }),
		});

		expect(diff.previous_attributes).toEqual({
			billing_controls: { [key]: [] },
		});
		expect(() =>
			PlanPreviousAttributesV0Schema.parse(diff.previous_attributes),
		).not.toThrow();
	});

	test(`billing_controls: deleting ${key} keeps the previous array`, () => {
		const previous = createdLanes[key];
		const diff = diffPlanV1PreviewFields({
			from: plan({ billing_controls: { [key]: previous } }),
			to: plan({ billing_controls: { [key]: [] } }),
		});

		expect(diff.previous_attributes).toEqual({
			billing_controls: { [key]: previous },
		});
		expect(() =>
			PlanPreviousAttributesV0Schema.parse(diff.previous_attributes),
		).not.toThrow();
	});
}

// Adding the first mapping to a plan that had none: the diff emits
// `processors: null` (previous was undefined) so the key survives JSON, and the
// picked schema has to accept that null the way free_trial already does.
// Red (before): PlanPreviousAttributesV0Schema.parse throws invalid_type,
// so handlePreviewUpdateCatalogV2 never returns for a first-time mapping.
test("processors: first mapping on an unmapped plan parses", () => {
	const diff = diffPlanV1PreviewFields({
		from: plan({}),
		to: plan({ processors: { stripe: { product_id: "prod_first" } } }),
	});

	expect(diff.previous_attributes).toEqual({ processors: null });
	expect(() =>
		PlanPreviousAttributesV0Schema.parse(diff.previous_attributes),
	).not.toThrow();
});

test("processors: re-mapping keeps the previous mapping", () => {
	const diff = diffPlanV1PreviewFields({
		from: plan({ processors: { stripe: { product_id: "prod_old" } } }),
		to: plan({ processors: { stripe: { product_id: "prod_new" } } }),
	});

	expect(diff.previous_attributes).toEqual({
		processors: { stripe: { product_id: "prod_old" } },
	});
	expect(() =>
		PlanPreviousAttributesV0Schema.parse(diff.previous_attributes),
	).not.toThrow();
});
