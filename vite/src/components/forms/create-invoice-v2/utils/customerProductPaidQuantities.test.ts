import { describe, expect, test } from "bun:test";
import type { FullCusProduct } from "@autumn/shared";
import {
	customerProductToPaidFeatureQuantities,
	customerProductToPaidLicenseQuantities,
} from "./customerProductPaidQuantities";

const prepaidPrice = ({
	featureId,
	billingUnits,
}: {
	featureId: string;
	billingUnits: number;
}) => ({
	price: {
		config: {
			type: "usage",
			bill_when: "start_of_period",
			feature_id: featureId,
			internal_feature_id: `int_${featureId}`,
			billing_units: billingUnits,
			usage_tiers: [{ to: -1, amount: 10 }],
			interval: "month",
		},
	},
});

const cusProduct = (overrides: Partial<FullCusProduct>) =>
	({
		options: [],
		customer_prices: [],
		customer_licenses: [],
		...overrides,
	}) as unknown as FullCusProduct;

describe("customerProductToPaidFeatureQuantities", () => {
	test("expands packs with the saved version's billing units", () => {
		expect(
			customerProductToPaidFeatureQuantities({
				cusProduct: cusProduct({
					options: [
						{
							feature_id: "credits",
							internal_feature_id: "int_credits",
							quantity: 2,
						},
					],
					customer_prices: [
						prepaidPrice({ featureId: "credits", billingUnits: 100 }),
					] as unknown as FullCusProduct["customer_prices"],
				}),
			}),
		).toEqual({ credits: 200 });
	});

	test("skips features with no packs bought", () => {
		expect(
			customerProductToPaidFeatureQuantities({
				cusProduct: cusProduct({
					options: [{ feature_id: "credits", quantity: 0 }],
					customer_prices: [
						prepaidPrice({ featureId: "credits", billingUnits: 100 }),
					] as unknown as FullCusProduct["customer_prices"],
				}),
			}),
		).toEqual({});
	});
});

describe("customerProductToPaidLicenseQuantities", () => {
	test("bills the saved paid seats, never the included ones", () => {
		expect(
			customerProductToPaidLicenseQuantities({
				cusProduct: cusProduct({
					customer_licenses: [
						{ paid_quantity: 0, planLicense: { product: { id: "editor" } } },
						{ paid_quantity: 3, planLicense: { product: { id: "viewer" } } },
						{ paid_quantity: 4, planLicense: null },
					] as unknown as FullCusProduct["customer_licenses"],
				}),
			}),
		).toEqual({ viewer: 3 });
	});
});
