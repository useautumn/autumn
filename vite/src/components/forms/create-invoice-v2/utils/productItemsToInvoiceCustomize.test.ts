import { describe, expect, test } from "bun:test";
import { BillingMethod, type ProductItem, UsageModel } from "@autumn/shared";
import { productItemsToInvoiceCustomize } from "./productItemsToInvoiceCustomize";

const items = (list: unknown[]) => list as ProductItem[];

describe("productItemsToInvoiceCustomize", () => {
	test("returns undefined when the plan was not customized", () => {
		expect(productItemsToInvoiceCustomize({ items: null })).toBeUndefined();
	});

	test("strips catalog-only fields the API rejects", () => {
		const result = productItemsToInvoiceCustomize({
			items: items([
				{
					feature_id: "messages",
					price: 0.1,
					billing_units: 1,
					usage_model: UsageModel.PayPerUse,
					included_usage: 100,
					feature_type: "single_use",
					entitlement_id: "ent_1",
					price_id: "pr_1",
					created_at: 1,
					usage_limit: 50,
				},
			]),
		});

		expect(result?.items?.[0].price).toEqual({
			amount: 0.1,
			billing_units: 1,
			billing_method: BillingMethod.UsageBased,
		});
	});

	test("maps the base price item to customize.price", () => {
		const result = productItemsToInvoiceCustomize({
			items: items([
				{ feature_id: null, price: 23, interval: "quarter", created_at: 1 },
			]),
		});

		expect(result?.price).toEqual({ amount: 23, interval: "quarter" });
		expect(result?.items).toBeUndefined();
	});

	test("nulls the base price when the editor removed that item", () => {
		const result = productItemsToInvoiceCustomize({
			items: items([
				{
					feature_id: "messages",
					price: 0.1,
					usage_model: UsageModel.PayPerUse,
				},
			]),
		});

		expect(result?.price).toBeNull();
	});

	test("derives billing_method from the usage model", () => {
		const result = productItemsToInvoiceCustomize({
			items: items([
				{ feature_id: "seats", price: 10, usage_model: UsageModel.Prepaid },
			]),
		});

		expect(result?.items?.[0].price?.billing_method).toBe(
			BillingMethod.Prepaid,
		);
	});
});
