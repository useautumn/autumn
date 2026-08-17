import { expect, test } from "bun:test";
import type { EntitlementWithFeature, Feature, Price } from "../../index.js";
import { mapToProductItems } from "./mapToProductV2.js";

// Legacy/customized products may omit relational arrays; mapping must remain total.
test("mapToProductItems normalizes missing product relations", () => {
	expect(
		mapToProductItems({
			prices: undefined as never,
			entitlements: undefined as never,
			features: [],
		}),
	).toEqual([]);
});

const creditsFeature = {
	id: "AI_CREDITS",
	name: "AI Credits",
	config: { usage_type: "single_use" },
} as unknown as Feature;

// An entitlement grandfathered from an older version, paired with a custom price
// the customer product re-stamped with its own internal_product_id.
const crossVersionPair = () => {
	const entitlement = {
		id: "ent_credits",
		internal_product_id: "prod_v3",
		allowance: 0,
		feature_id: "AI_CREDITS",
		feature: creditsFeature,
	} as unknown as EntitlementWithFeature;

	const price = {
		id: "pr_credits",
		entitlement_id: "ent_credits",
		internal_product_id: "prod_v6",
		config: {
			type: "usage",
			feature_id: "AI_CREDITS",
			interval: "month",
			billing_units: 1,
			bill_when: "end_of_period",
			usage_tiers: [{ to: "inf", amount: 0.01 }],
		},
	} as unknown as Price;

	return { entitlement, price };
};

test("mapToProductItems keeps the usage price when it and its entitlement span product versions", () => {
	const { entitlement, price } = crossVersionPair();

	const items = mapToProductItems({
		prices: [price],
		entitlements: [entitlement],
		features: [creditsFeature],
	});

	expect(items).toHaveLength(1);
	expect(items[0].tiers).toEqual([{ amount: 0.01, to: "inf" }]);
	expect(items[0].included_usage).toBe(0);
});

test("mapToProductItems emits one item per price when products match", () => {
	const { entitlement, price } = crossVersionPair();
	entitlement.internal_product_id = "prod_v6";

	const items = mapToProductItems({
		prices: [price],
		entitlements: [entitlement],
		features: [creditsFeature],
	});

	expect(items).toHaveLength(1);
	expect(items[0].tiers).toEqual([{ amount: 0.01, to: "inf" }]);
});
