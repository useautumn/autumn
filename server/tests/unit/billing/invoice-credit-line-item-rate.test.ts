/**
 * Invoice-credit lines are priced at the plan item's rate, not at one currency
 * unit per credit.
 *
 * Contract:
 *   B1 flat $0.10/credit          → each source line = credits × 0.10, offset = (credits − overage) × 0.10
 *   B2 $5 per 100 credits         → rate 0.05 per credit
 *   B3 customer billed in eur     → the eur override's tier amount sets the rate
 *   B4 fractional rate + drift    → lines still sum to the cent-exact target
 */

import { describe, expect, test } from "bun:test";
import {
	type Feature,
	FeatureType,
	type FullCusEntWithFullCusProduct,
	Infinite,
	invoiceCreditCustomerEntitlementToLineItems,
	type LineItemContext,
	type Price,
	type Product,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { features } from "@tests/utils/fixtures/db/features.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { products } from "@tests/utils/fixtures/db/products.js";

const CREDIT_FEATURE_ID = "usage_credits";

const sourceFeatures = ["sms", "voice"].map((id) =>
	features.create({ id, name: id.toUpperCase() }),
) as Feature[];

const creditCustomerEntitlement = ({
	included,
	creditsPerSource,
}: {
	included: number;
	creditsPerSource: number[];
}): FullCusEntWithFullCusProduct => {
	const totalCredits = creditsPerSource.reduce((sum, c) => sum + c, 0);
	return {
		...customerEntitlements.create({
			featureId: CREDIT_FEATURE_ID,
			featureName: "Usage credits",
			featureType: FeatureType.CreditSystem,
			featureConfig: { schema: [] },
			allowance: included,
			balance: included - totalCredits,
		}),
		invoice_credit: true,
		usage_attribution: Object.fromEntries(
			sourceFeatures.map((feature, index) => [
				feature.internal_id,
				{ units: 1, credits: creditsPerSource[index] },
			]),
		),
		customer_product: null,
	};
};

const creditPrice = ({
	amount,
	billingUnits = 1,
	currencies,
}: {
	amount: number;
	billingUnits?: number;
	currencies?: Record<
		string,
		{ usage_tiers: { to: string; amount: number }[] }
	>;
}): Price => {
	const base = prices.createConsumable({
		id: "price_credits",
		featureId: CREDIT_FEATURE_ID,
	});
	return {
		...base,
		config: {
			...base.config,
			billing_units: billingUnits,
			usage_tiers: [{ to: Infinite, amount }],
			base_currency: "usd",
			currencies,
		},
	} as Price;
};

const contextFor = ({
	price,
	currency = "usd",
}: {
	price: Price;
	currency?: string;
}): LineItemContext => ({
	price,
	product: products.create() as unknown as Product,
	currency,
	direction: "charge",
	now: Date.now(),
	billingTiming: "in_arrear",
});

const amountsOf = (lineItems: { amount: number }[]) =>
	lineItems.map((lineItem) => lineItem.amount);

const sumOf = (lineItems: { amount: number }[]) =>
	Math.round(
		lineItems.reduce((sum, lineItem) => sum + lineItem.amount, 0) * 100,
	) / 100;

describe("invoiceCreditCustomerEntitlementToLineItems rate", () => {
	test("B1 prices source lines and the offset at the item's flat rate", () => {
		const lineItems = invoiceCreditCustomerEntitlementToLineItems({
			customerEntitlement: creditCustomerEntitlement({
				included: 100,
				creditsPerSource: [50, 150],
			}),
			context: contextFor({ price: creditPrice({ amount: 0.1 }) }),
			features: sourceFeatures,
		});

		expect(amountsOf(lineItems)).toEqual([5, 15, -10]);
		expect(sumOf(lineItems)).toBe(10);
	});

	test("B2 billing units divide the tier amount into the per-credit rate", () => {
		const lineItems = invoiceCreditCustomerEntitlementToLineItems({
			customerEntitlement: creditCustomerEntitlement({
				included: 100,
				creditsPerSource: [50, 150],
			}),
			context: contextFor({
				price: creditPrice({ amount: 5, billingUnits: 100 }),
			}),
			features: sourceFeatures,
		});

		expect(amountsOf(lineItems)).toEqual([2.5, 7.5, -5]);
		expect(sumOf(lineItems)).toBe(5);
	});

	test("B3 a customer billed in another currency uses that currency's tier amount", () => {
		const lineItems = invoiceCreditCustomerEntitlementToLineItems({
			customerEntitlement: creditCustomerEntitlement({
				included: 100,
				creditsPerSource: [50, 150],
			}),
			context: contextFor({
				price: creditPrice({
					amount: 1,
					currencies: { eur: { usage_tiers: [{ to: Infinite, amount: 0.8 }] } },
				}),
				currency: "eur",
			}),
			features: sourceFeatures,
		});

		expect(amountsOf(lineItems)).toEqual([40, 120, -80]);
		expect(sumOf(lineItems)).toBe(80);
	});

	test("B4 a fractional rate keeps the invoice cent-exact by absorbing drift into the lines", () => {
		// 3.333 + 3.333 credits at $0.30 = 0.9999 + 0.9999 → each line rounds to 1.00, target is 2.00.
		const lineItems = invoiceCreditCustomerEntitlementToLineItems({
			customerEntitlement: creditCustomerEntitlement({
				included: 0,
				creditsPerSource: [3.333, 3.333],
			}),
			context: contextFor({ price: creditPrice({ amount: 0.3 }) }),
			features: sourceFeatures,
		});

		expect(lineItems).toHaveLength(2);
		expect(sumOf(lineItems)).toBe(2);
	});
});
