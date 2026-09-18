import { describe, expect, test } from "bun:test";
import {
	BillingMethod,
	ErrCode,
	Infinite,
	type Price,
	TierBehavior,
	type UsagePriceConfig,
} from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";
import { featureQuantityToAmount } from "@/internal/invoices/actions/create/compute/featureQuantityToAmount";
import { findInvoiceFeaturePrice } from "@/internal/invoices/actions/create/compute/findInvoiceFeaturePrice";

const prepaidSeats = prices.createPrepaid({
	id: "seats_prepaid",
	featureId: "seats",
}); // $10 / unit
const usageCredits = prices.createConsumable({
	id: "credits_usage",
	featureId: "credits",
}); // $1 / unit
const catalog = [
	prices.createFixed({ id: "base" }),
	prepaidSeats,
	usageCredits,
];

describe("findInvoiceFeaturePrice", () => {
	test("prepaid behavior selects the prepaid price", () => {
		expect(
			findInvoiceFeaturePrice({
				prices: catalog,
				featureId: "seats",
				billingBehavior: BillingMethod.Prepaid,
			}).id,
		).toBe("seats_prepaid");
	});

	test("usage_based behavior selects the consumable price", () => {
		expect(
			findInvoiceFeaturePrice({
				prices: catalog,
				featureId: "credits",
				billingBehavior: BillingMethod.UsageBased,
			}).id,
		).toBe("credits_usage");
	});

	test("a feature not on the plan is rejected", () => {
		expect(() =>
			findInvoiceFeaturePrice({
				prices: catalog,
				featureId: "words",
				billingBehavior: BillingMethod.Prepaid,
			}),
		).toThrow(expect.objectContaining({ code: ErrCode.InvalidRequest }));
	});

	test("a feature without a price of the requested behavior is rejected", () => {
		expect(() =>
			findInvoiceFeaturePrice({
				prices: catalog,
				featureId: "seats",
				billingBehavior: BillingMethod.UsageBased,
			}),
		).toThrow(expect.objectContaining({ code: ErrCode.InvalidRequest }));
	});
});

const prepaidConfig = prepaidSeats.config as UsagePriceConfig;
const tiered: Price = {
	...prepaidSeats,
	id: "credits_tiered",
	config: {
		...prepaidConfig,
		feature_id: "credits",
		billing_units: 100,
		usage_tiers: [
			{ to: 500, amount: 10 },
			{ to: Infinite, amount: 5 },
		],
	},
};
const volume: Price = {
	...tiered,
	id: "credits_volume",
	tier_behavior: TierBehavior.VolumeBased,
};

describe("featureQuantityToAmount", () => {
	test("flat price multiplies billable units by the unit rate", () => {
		expect(
			featureQuantityToAmount({
				price: usageCredits,
				quantity: 2500,
				currency: "usd",
			}),
		).toBe(2500);
	});

	test("billing units round the quantity up to the next pack", () => {
		// 250 units at $10 per 100 → rounds to 300 units → 3 packs → $30
		expect(
			featureQuantityToAmount({
				price: {
					...prepaidSeats,
					config: { ...prepaidSeats.config, billing_units: 100 },
				},
				quantity: 250,
				currency: "usd",
			}),
		).toBe(30);
	});

	test("graduated tiers charge each band at its own rate", () => {
		// 800 units, packs of 100: 5 packs at $10 + 3 packs at $5 = $65
		expect(
			featureQuantityToAmount({
				price: tiered,
				quantity: 800,
				currency: "usd",
			}),
		).toBe(65);
	});

	test("volume tiers charge the whole quantity at the matched tier", () => {
		// 800 units → tier "inf" at $5 per pack → 8 packs → $40
		expect(
			featureQuantityToAmount({
				price: volume,
				quantity: 800,
				currency: "usd",
			}),
		).toBe(40);
	});

	test("zero quantity produces no charge", () => {
		expect(
			featureQuantityToAmount({
				price: usageCredits,
				quantity: 0,
				currency: "usd",
			}),
		).toBe(0);
	});
});
