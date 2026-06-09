import { describe, expect, test } from "bun:test";
import {
	type Price,
	PriceType,
	BillingInterval,
	BillWhen,
	Infinite,
	PriceSchema,
} from "@autumn/shared";
import { pricesAreSame } from "@shared/utils/productUtils/priceUtils/comparePrice/pricesAreSame";

const fixedPrice = {
	id: "price_fixed",
	internal_product_id: "prod_1",
	org_id: "org_1",
	created_at: 1,
	tier_behavior: null,
	is_custom: false,
	entitlement_id: null,
	proration_config: null,
	config: {
		type: PriceType.Fixed,
		amount: 10,
		interval: BillingInterval.Month,
		stripe_product_id: null,
		feature_id: null,
		internal_feature_id: null,
	},
} satisfies Price;

const usagePrice = {
	id: "price_usage",
	internal_product_id: "prod_1",
	org_id: "org_1",
	created_at: 1,
	tier_behavior: null,
	is_custom: false,
	entitlement_id: "ent_1",
	proration_config: null,
	config: {
		type: PriceType.Usage,
		bill_when: BillWhen.EndOfPeriod,
		billing_units: 1,
		internal_feature_id: "feature_internal_1",
		feature_id: "messages",
		usage_tiers: [{ to: Infinite, amount: 1 }],
		interval: BillingInterval.Month,
	},
} satisfies Price;

describe("pricesAreSame", () => {
	test("normalizes ignored fixed price metadata", () => {
		const parsed = PriceSchema.parse({
			...fixedPrice,
			config: {
				...fixedPrice.config,
				stripe_product_id: "prod_fixed",
				feature_id: "base",
				internal_feature_id: "internal_base",
			},
		});

		expect(parsed.config.stripe_product_id).toBeNull();
		expect(parsed.config.feature_id).toBeNull();
		expect(parsed.config.internal_feature_id).toBeNull();
	});

	test("returns false instead of throwing for fixed vs usage prices", () => {
		expect(pricesAreSame(fixedPrice, usagePrice)).toBe(false);
	});

	test("returns false instead of throwing for usage vs fixed prices", () => {
		expect(pricesAreSame(usagePrice, fixedPrice)).toBe(false);
	});
});
