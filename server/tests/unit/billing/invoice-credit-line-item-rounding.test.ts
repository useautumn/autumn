import { describe, expect, test } from "bun:test";
import {
	type Feature,
	FeatureType,
	type FullCusEntWithFullCusProduct,
	invoiceCreditCustomerEntitlementToLineItems,
	type LineItemContext,
	type Product,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { features } from "@tests/utils/fixtures/db/features.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { products } from "@tests/utils/fixtures/db/products.js";

const CREDIT_FEATURE_ID = "usage_credits";

const sourceFeatures = ["sms", "mms", "voice"].map((id) =>
	features.create({ id, name: id.toUpperCase() }),
) as Feature[];

const creditCustomerEntitlement = ({
	included,
	creditsPerSource,
}: {
	included: number;
	creditsPerSource: number;
}): FullCusEntWithFullCusProduct => {
	const totalCredits = creditsPerSource * sourceFeatures.length;
	return {
		...customerEntitlements.create({
			featureId: CREDIT_FEATURE_ID,
			featureName: "Usage credits",
			featureType: FeatureType.CreditSystem,
			featureConfig: { invoice_credit: true, schema: [] },
			allowance: included,
			balance: included - totalCredits,
		}),
		usage_attribution: Object.fromEntries(
			sourceFeatures.map((feature) => [
				feature.internal_id,
				{ units: 1, credits: creditsPerSource },
			]),
		),
		customer_product: null,
	};
};

const context: LineItemContext = {
	price: prices.createConsumable({
		id: "price_credits",
		featureId: CREDIT_FEATURE_ID,
	}),
	product: products.create() as unknown as Product,
	currency: "usd",
	direction: "charge",
	now: Date.now(),
	billingTiming: "in_arrear",
};

const lastOf = <T>(items: T[]): T | undefined => items[items.length - 1];

const amountsOf = (lineItems: { amount: number }[]) =>
	lineItems.map((lineItem) => lineItem.amount);

const sumOf = (lineItems: { amount: number }[]) =>
	Math.round(
		lineItems.reduce((sum, lineItem) => sum + lineItem.amount, 0) * 100,
	) / 100;

describe("invoiceCreditCustomerEntitlementToLineItems rounding", () => {
	test("keeps the credit line exact and moves rounding drift onto the largest usage line", () => {
		// 3 x 1.004 = 3.012 credits; each line rounds to 1.00 but the overage rounds to 2.01.
		const lineItems = invoiceCreditCustomerEntitlementToLineItems({
			customerEntitlement: creditCustomerEntitlement({
				included: 1,
				creditsPerSource: 1.004,
			}),
			context,
			features: sourceFeatures,
		});

		const creditLine = lastOf(lineItems);
		expect(creditLine?.description).toBe("Credits applied");
		expect(creditLine?.amount).toBe(-1);
		expect(amountsOf(lineItems.slice(0, -1))).toEqual([1.01, 1, 1]);
		expect(sumOf(lineItems)).toBe(2.01);
	});

	test("leaves usage lines untouched when their rounded sum already matches", () => {
		const lineItems = invoiceCreditCustomerEntitlementToLineItems({
			customerEntitlement: creditCustomerEntitlement({
				included: 1.5,
				creditsPerSource: 0.5,
			}),
			context,
			features: sourceFeatures,
		});

		expect(amountsOf(lineItems)).toEqual([0.5, 0.5, 0.5, -1.5]);
		expect(sumOf(lineItems)).toBe(0);
	});

	test("fully offset overage nets the usage lines to zero against the exact credit total", () => {
		const lineItems = invoiceCreditCustomerEntitlementToLineItems({
			customerEntitlement: creditCustomerEntitlement({
				included: 0,
				creditsPerSource: 1.004,
			}),
			context,
			features: sourceFeatures,
			fullyOffsetOverage: true,
		});

		expect(lastOf(lineItems)?.amount).toBe(-3.01);
		expect(sumOf(lineItems)).toBe(0);
	});

	test("emits no credit line when nothing was included, but still totals the rounded overage", () => {
		const lineItems = invoiceCreditCustomerEntitlementToLineItems({
			customerEntitlement: creditCustomerEntitlement({
				included: 0,
				creditsPerSource: 1.004,
			}),
			context,
			features: sourceFeatures,
		});

		expect(lineItems).toHaveLength(3);
		expect(amountsOf(lineItems)).toEqual([1.01, 1, 1]);
		expect(sumOf(lineItems)).toBe(3.01);
	});
});
