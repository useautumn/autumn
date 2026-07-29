import { describe, expect, test } from "bun:test";
import { AppEnv, BillingInterval, type ProductItem } from "@autumn/shared";
import { validateProductItems } from "@/internal/products/product-items/validateProductItems";

const run = (item: ProductItem, multiCurrencyEnabled = true) =>
	validateProductItems({
		newItems: [item],
		features: [],
		orgId: "org_1",
		env: AppEnv.Sandbox,
		multiCurrencyEnabled,
	});

describe("validateProductItems multi-currency", () => {
	test("rejects additional_currencies without base_currency", () => {
		expect(() =>
			run({
				price: 10,
				interval: BillingInterval.Month,
				additional_currencies: [{ currency: "eur", amount: 9 }],
			} as unknown as ProductItem),
		).toThrow(/base_currency/i);
	});

	test("accepts additional_currencies with base_currency stamped", () => {
		expect(() =>
			run({
				price: 10,
				interval: BillingInterval.Month,
				base_currency: "usd",
				additional_currencies: [{ currency: "eur", amount: 9 }],
			} as unknown as ProductItem),
		).not.toThrow();
	});

	test("rejects tier-level additional_currencies without base_currency", () => {
		expect(() =>
			run({
				feature_id: "messages",
				feature_type: "single_use",
				included_usage: 0,
				interval: BillingInterval.Month,
				tiers: [
					{
						to: -1,
						amount: 0.5,
						additional_currencies: [{ currency: "eur", amount: 0.4 }],
					},
				],
			} as unknown as ProductItem),
		).toThrow(/base_currency/i);
	});

	test("rejects additional_currencies when the org flag is off", () => {
		expect(() =>
			run(
				{
					price: 10,
					interval: BillingInterval.Month,
					base_currency: "usd",
					additional_currencies: [{ currency: "eur", amount: 9 }],
				} as unknown as ProductItem,
				false,
			),
		).toThrow(/not enabled/i);
	});

	test("rejects tier-level additional_currencies when the org flag is off", () => {
		expect(() =>
			run(
				{
					feature_id: "messages",
					feature_type: "single_use",
					included_usage: 0,
					interval: BillingInterval.Month,
					base_currency: "usd",
					tiers: [
						{
							to: -1,
							amount: 0.5,
							additional_currencies: [{ currency: "eur", amount: 0.4 }],
						},
					],
				} as unknown as ProductItem,
				false,
			),
		).toThrow(/not enabled/i);
	});

	test("plain items pass when the org flag is off", () => {
		expect(() =>
			run(
				{
					price: 10,
					interval: BillingInterval.Month,
				} as unknown as ProductItem,
				false,
			),
		).not.toThrow();
	});

	test("rejects additional_currencies on a zero price", () => {
		expect(() =>
			run({
				price: 0,
				interval: BillingInterval.Month,
				base_currency: "usd",
				additional_currencies: [{ currency: "eur", amount: 9 }],
			} as unknown as ProductItem),
		).toThrow(/non-zero/i);
	});

	test("rejects item-level additional_currencies alongside tiers", () => {
		expect(() =>
			run({
				feature_id: "messages",
				feature_type: "single_use",
				included_usage: 0,
				interval: BillingInterval.Month,
				base_currency: "usd",
				additional_currencies: [{ currency: "eur", amount: 9 }],
				tiers: [{ to: -1, amount: 0.5 }],
			} as unknown as ProductItem),
		).toThrow(/on each tier/i);
	});
});
