/**
 * Pay-per-use volume follows the prepaid (Stripe) rule: once total usage passes the
 * included amount, every unit is charged at the band total usage lands in.
 */

import { describe, expect, test } from "bun:test";
import {
	type EntityBalance,
	type FullCusEntWithFullCusProduct,
	type LineItemContext,
	type Price,
	TierBehavior,
	type UsageTier,
	usagePriceToLineItem,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { features } from "@tests/utils/fixtures/db/features.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { products } from "@tests/utils/fixtures/db/products.js";

type PriceKind = "consumable" | "allocated" | "prepaid";

const createPrice = ({
	kind,
	tiers,
	billingUnits = 1,
}: {
	kind: PriceKind;
	tiers: UsageTier[];
	billingUnits?: number;
}): Price => {
	const params = {
		id: "price_messages",
		featureId: "messages",
		entitlementId: "ent_messages",
	};
	const base =
		kind === "consumable"
			? prices.createConsumable(params)
			: kind === "allocated"
				? prices.createAllocated(params)
				: prices.createPrepaid(params);

	return {
		...base,
		tier_behavior: TierBehavior.VolumeBased,
		config: { ...base.config, usage_tiers: tiers, billing_units: billingUnits },
	} as Price;
};

const priceVolumeLine = ({
	kind = "consumable",
	tiers,
	allowance,
	balance,
	billingUnits,
	entities,
	prepaidQuantity,
}: {
	kind?: PriceKind;
	tiers: UsageTier[];
	allowance: number;
	balance: number;
	billingUnits?: number;
	entities?: Record<string, EntityBalance>;
	prepaidQuantity?: number;
}) => {
	const customerEntitlement = customerEntitlements.create({
		entitlementId: "ent_messages",
		featureId: "messages",
		featureName: "Messages",
		allowance,
		balance,
		entities: entities ?? null,
		entityFeatureId: entities ? "users" : null,
	});
	const price = createPrice({ kind, tiers, billingUnits });
	const product = products.createFull({
		id: "pro",
		name: "Pro",
		prices: [price],
		entitlements: [customerEntitlement.entitlement],
	});
	const customerProduct = customerProducts.create({
		productId: product.id,
		product,
		customerEntitlements: [customerEntitlement],
		customerPrices: [prices.createCustomer({ price })],
		options:
			prepaidQuantity === undefined
				? []
				: [
						{
							feature_id: "messages",
							internal_feature_id: "internal_messages",
							quantity: prepaidQuantity,
						},
					],
	});
	const cusEnt: FullCusEntWithFullCusProduct = {
		...customerEntitlement,
		customer_product: customerProduct,
	};
	const context = {
		price,
		product,
		feature: features.create({ id: "messages", name: "Messages" }),
		currency: "usd",
		direction: "charge",
		now: Date.now(),
		billingTiming: "in_arrear",
	} as LineItemContext;

	return usagePriceToLineItem({ cusEnt, context }).amount;
};

const SINGLE_TIER = [{ to: "inf", amount: 0.5 }] as UsageTier[];

describe("usagePriceToLineItem: pay-per-use volume", () => {
	test("100 included, 150 used → all 150 at the band rate ($75, not $0)", () => {
		expect(
			priceVolumeLine({ tiers: SINGLE_TIER, allowance: 100, balance: -50 }),
		).toBe(75);
	});

	test("no included, 40 used → 40 × $0.50 = $20", () => {
		expect(
			priceVolumeLine({ tiers: SINGLE_TIER, allowance: 0, balance: -40 }),
		).toBe(20);
	});

	test("within included → $0", () => {
		expect(
			priceVolumeLine({ tiers: SINGLE_TIER, allowance: 100, balance: 30 }),
		).toBe(0);
	});

	test("billing units round total usage up: 250 used in packs of 100 → 3 packs × $5 = $15", () => {
		expect(
			priceVolumeLine({
				tiers: [{ to: "inf", amount: 5 }] as UsageTier[],
				allowance: 100,
				balance: -150,
				billingUnits: 100,
			}),
		).toBe(15);
	});

	test("band is picked from total usage on the net tiers: 5 included, 25 used → 25 × $0.80 = $20", () => {
		// Total-usage bands 10/20/30/40 stored net of 5 included.
		const netTiers = [
			{ to: 5, amount: 1 },
			{ to: 15, amount: 0.9 },
			{ to: 25, amount: 0.8 },
			{ to: 35, amount: 0.7 },
			{ to: "inf", amount: 0.5 },
		] as UsageTier[];

		expect(
			priceVolumeLine({ tiers: netTiers, allowance: 5, balance: -20 }),
		).toBe(20);
	});

	describe("flat_amount", () => {
		const FLAT_TIERS = [
			{ to: 100, amount: 0, flat_amount: 5 },
			{ to: "inf", amount: 0, flat_amount: 20 },
		] as UsageTier[];

		test("usage at the included amount → $0, the tier-1 flat fee is not charged", () => {
			expect(
				priceVolumeLine({ tiers: FLAT_TIERS, allowance: 100, balance: 0 }),
			).toBe(0);
		});

		test("no included and no usage → $0", () => {
			expect(
				priceVolumeLine({ tiers: FLAT_TIERS, allowance: 0, balance: 0 }),
			).toBe(0);
		});

		test("1 unit over included → tier-1 flat fee ($5)", () => {
			expect(
				priceVolumeLine({ tiers: FLAT_TIERS, allowance: 100, balance: -1 }),
			).toBe(5);
		});

		test("total usage past tier 1 → only tier-2 flat fee ($20)", () => {
			expect(
				priceVolumeLine({ tiers: FLAT_TIERS, allowance: 100, balance: -150 }),
			).toBe(20);
		});
	});

	test("entity feature: band and amount come from the customer's actual total usage", () => {
		// 130 + 120 + 90 used = 340 units at $0.50; ent_c's 10 unused included units aren't billed.
		const entities = {
			ent_a: { id: "ent_a", balance: -30, adjustment: 0 },
			ent_b: { id: "ent_b", balance: -20, adjustment: 0 },
			ent_c: { id: "ent_c", balance: 10, adjustment: 0 },
		} as Record<string, EntityBalance>;

		expect(
			priceVolumeLine({
				tiers: SINGLE_TIER,
				allowance: 100,
				balance: 0,
				entities,
			}),
		).toBe(170);
	});

	test("entity feature: total usage within the customer's included amount → $0", () => {
		// 150 + 50 used against 2 × 100 included.
		const entities = {
			ent_a: { id: "ent_a", balance: -50, adjustment: 0 },
			ent_b: { id: "ent_b", balance: 50, adjustment: 0 },
		} as Record<string, EntityBalance>;

		expect(
			priceVolumeLine({
				tiers: SINGLE_TIER,
				allowance: 100,
				balance: 0,
				entities,
			}),
		).toBe(0);
	});
});

describe("usagePriceToLineItem: allocated (v1) volume", () => {
	test("3 included, 5 seats → all 5 seats at the band rate ($50, not $0)", () => {
		expect(
			priceVolumeLine({
				kind: "allocated",
				tiers: [{ to: "inf", amount: 10 }] as UsageTier[],
				allowance: 3,
				balance: -2,
			}),
		).toBe(50);
	});

	test("within included seats → $0", () => {
		expect(
			priceVolumeLine({
				kind: "allocated",
				tiers: [{ to: "inf", amount: 10 }] as UsageTier[],
				allowance: 3,
				balance: 1,
			}),
		).toBe(0);
	});
});

describe("usagePriceToLineItem: prepaid volume is unchanged", () => {
	test("100 included + 2 packs of 100 → whole 300 charged at the band rate", () => {
		// Prepaid still adds the allowance back: 300 units at $10 per 100 = $30.
		expect(
			priceVolumeLine({
				kind: "prepaid",
				tiers: [{ to: "inf", amount: 10 }] as UsageTier[],
				allowance: 100,
				balance: 300,
				billingUnits: 100,
				prepaidQuantity: 2,
			}),
		).toBe(30);
	});
});
