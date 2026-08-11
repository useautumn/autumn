import { describe, expect, test } from "bun:test";
import { FeatureUsageType, productToEntitlementPrices } from "@autumn/shared";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";
import { features } from "@tests/utils/fixtures/db/features";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";

const seatsFeature = features.create({
	id: "seats",
	internalId: "feat_internal_seats",
	name: "Seats",
	config: { usage_type: FeatureUsageType.Continuous },
});

describe("productToEntitlementPrices", () => {
	test("empty product yields no pairs", () => {
		expect(
			productToEntitlementPrices({
				product: products.createFull({ entitlements: [], prices: [] }),
			}),
		).toEqual([]);
	});

	test("every entitlement produces a pair; unpriced ents pair with undefined", () => {
		const ent = entitlements.buildWithFeature({ id: "ent_free" });
		const pairs = productToEntitlementPrices({
			product: products.createFull({ entitlements: [ent], prices: [] }),
		});
		expect(pairs).toHaveLength(1);
		expect(pairs[0].entitlement).toBe(ent);
		expect(pairs[0].price).toBeUndefined();
	});

	test("price pairs via entitlement_id", () => {
		const ent = entitlements.buildWithFeature({ id: "ent_paid" });
		const price = prices.buildUsage({
			overrides: { entitlement_id: "ent_paid" },
		});
		const pairs = productToEntitlementPrices({
			product: products.createFull({ entitlements: [ent], prices: [price] }),
		});
		expect(pairs[0].price).toBe(price);
	});

	test("base (fixed) price is never paired — it has no entitlement_id", () => {
		const ent = entitlements.buildWithFeature({ id: "ent_1" });
		const basePrice = prices.buildFixed();
		const pairs = productToEntitlementPrices({
			product: products.createFull({
				entitlements: [ent],
				prices: [basePrice],
			}),
		});
		expect(pairs).toHaveLength(1);
		expect(pairs[0].price).toBeUndefined();
	});

	test("prices not referencing any entitlement are dropped from the output", () => {
		const ent = entitlements.buildWithFeature({ id: "ent_1" });
		const orphanPrice = prices.buildUsage({
			overrides: { id: "pr_orphan", entitlement_id: "ent_gone" },
		});
		const pairs = productToEntitlementPrices({
			product: products.createFull({
				entitlements: [ent],
				prices: [orphanPrice],
			}),
		});
		expect(pairs).toHaveLength(1);
		expect(pairs[0].price).toBeUndefined();
	});

	test("same internal_product_id wins over an earlier cross-product id match", () => {
		const ent = entitlements.buildWithFeature({
			id: "ent_1",
			internal_product_id: "prod_v2",
		});
		const crossProductPrice = prices.buildUsage({
			overrides: {
				id: "pr_cross",
				entitlement_id: "ent_1",
				internal_product_id: "prod_v1",
			},
		});
		const sameProductPrice = prices.buildUsage({
			overrides: {
				id: "pr_same",
				entitlement_id: "ent_1",
				internal_product_id: "prod_v2",
			},
		});
		const pairs = productToEntitlementPrices({
			product: products.createFull({
				entitlements: [ent],
				prices: [crossProductPrice, sameProductPrice],
			}),
		});
		expect(pairs[0].price).toBe(sameProductPrice);
	});

	test("falls back to the first id match when no same-product price exists", () => {
		const ent = entitlements.buildWithFeature({
			id: "ent_1",
			internal_product_id: "prod_v2",
		});
		const firstCross = prices.buildUsage({
			overrides: {
				id: "pr_first",
				entitlement_id: "ent_1",
				internal_product_id: "prod_v0",
			},
		});
		const secondCross = prices.buildUsage({
			overrides: {
				id: "pr_second",
				entitlement_id: "ent_1",
				internal_product_id: "prod_v1",
			},
		});
		const pairs = productToEntitlementPrices({
			product: products.createFull({
				entitlements: [ent],
				prices: [firstCross, secondCross],
			}),
		});
		expect(pairs[0].price).toBe(firstCross);
	});

	test("multiple entitlements each claim their own price by id", () => {
		const messagesEnt = entitlements.buildWithFeature({ id: "ent_messages" });
		const seatsEnt = entitlements.buildWithFeature({
			id: "ent_seats",
			internal_feature_id: seatsFeature.internal_id,
			feature_id: seatsFeature.id,
			feature: seatsFeature,
		});
		const messagesPrice = prices.buildUsage({
			overrides: { id: "pr_messages", entitlement_id: "ent_messages" },
		});
		const seatsPrice = prices.buildUsage({
			overrides: { id: "pr_seats", entitlement_id: "ent_seats" },
			configOverrides: {
				internal_feature_id: seatsFeature.internal_id,
				feature_id: seatsFeature.id,
			},
		});
		const pairs = productToEntitlementPrices({
			product: products.createFull({
				entitlements: [messagesEnt, seatsEnt],
				prices: [seatsPrice, messagesPrice],
			}),
		});
		expect(pairs).toHaveLength(2);
		expect(pairs[0].entitlement).toBe(messagesEnt);
		expect(pairs[0].price).toBe(messagesPrice);
		expect(pairs[1].entitlement).toBe(seatsEnt);
		expect(pairs[1].price).toBe(seatsPrice);
	});

	test("output preserves entitlement order", () => {
		const entA = entitlements.buildWithFeature({ id: "ent_a" });
		const entB = entitlements.buildWithFeature({ id: "ent_b" });
		const pairs = productToEntitlementPrices({
			product: products.createFull({
				entitlements: [entB, entA],
				prices: [],
			}),
		});
		expect(pairs.map((pair) => pair.entitlement.id)).toEqual([
			"ent_b",
			"ent_a",
		]);
	});
});
