import { describe, expect, test } from "bun:test";
import {
	type Price,
	PriceType,
	BillingInterval,
	BillWhen,
	Infinite,
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
	test("returns false instead of throwing for fixed vs usage prices", () => {
		expect(pricesAreSame(fixedPrice, usagePrice)).toBe(false);
	});

	test("returns false instead of throwing for usage vs fixed prices", () => {
		expect(pricesAreSame(usagePrice, fixedPrice)).toBe(false);
	});
});
