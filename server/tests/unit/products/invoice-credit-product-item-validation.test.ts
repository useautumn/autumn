import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	FeatureType,
	type ProductItem,
	ProductItemInterval,
	UsageModel,
} from "@autumn/shared";
import { features } from "@tests/utils/fixtures/db/features.js";
import { validateProductItems } from "@/internal/products/product-items/validateProductItems.js";

const invoiceCreditFeature = features.create({
	id: "invoice_credits",
	name: "Invoice credits",
	type: FeatureType.CreditSystem,
	config: { invoice_credit: true, schema: [] },
});

const invoiceCreditItem = ({
	price = 1,
	billingUnits = 1,
	additionalCurrencies,
}: {
	price?: number;
	billingUnits?: number;
	additionalCurrencies?: { currency: string; amount: number }[];
} = {}): ProductItem => ({
	feature_id: invoiceCreditFeature.id,
	included_usage: 100,
	interval: ProductItemInterval.Month,
	usage_model: UsageModel.PayPerUse,
	price,
	billing_units: billingUnits,
	base_currency: additionalCurrencies ? "usd" : undefined,
	additional_currencies: additionalCurrencies,
});

const validate = (item: ProductItem) =>
	validateProductItems({
		newItems: [item],
		features: [invoiceCreditFeature],
		orgId: "org_test",
		env: AppEnv.Sandbox,
		multiCurrencyEnabled: true,
	});

describe("invoice-credit product item validation", () => {
	test("accepts a flat effective price of one currency unit per credit", () => {
		expect(() => validate(invoiceCreditItem())).not.toThrow();
		expect(() =>
			validate(invoiceCreditItem({ price: 100, billingUnits: 100 })),
		).not.toThrow();
	});

	test("rejects a non-1:1 invoice-credit usage price", () => {
		expect(() => validate(invoiceCreditItem({ price: 2 }))).toThrow(
			"Invoice-credit features require a price of one currency unit per credit",
		);
		expect(() =>
			validate(invoiceCreditItem({ price: 0, billingUnits: 0 })),
		).toThrow(
			"Invoice-credit features require a price of one currency unit per credit",
		);
	});

	test("requires every configured currency to retain the 1:1 price", () => {
		expect(() =>
			validate(
				invoiceCreditItem({
					additionalCurrencies: [{ currency: "eur", amount: 0.8 }],
				}),
			),
		).toThrow(
			"Invoice-credit features require a price of one currency unit per credit",
		);
	});

	test("rejects flat fees in an additional currency tier", () => {
		const item: ProductItem = {
			feature_id: invoiceCreditFeature.id,
			included_usage: 100,
			interval: ProductItemInterval.Month,
			usage_model: UsageModel.PayPerUse,
			billing_units: 1,
			base_currency: "usd",
			tiers: [
				{
					to: "inf",
					amount: 1,
					additional_currencies: [
						{ currency: "eur", amount: 1, flat_amount: 2 },
					],
				},
			],
		};

		expect(() => validate(item)).toThrow(
			"Invoice-credit features require a price of one currency unit per credit",
		);
	});
});
