import { describe, expect, test } from "bun:test";
import { type ProductItem, type ProductV2, UsageModel } from "@autumn/shared";
import {
	type CustomerStatePlan,
	EMPTY_CUSTOMER_STATE_PLAN,
} from "@/components/forms/customer-state/customerStateSchema";
import { customerStatePlanToInvoicePlan } from "./customerStatePlanToInvoicePlan";

const creditsItem = {
	feature_id: "credits",
	usage_model: UsageModel.Prepaid,
	included_usage: 100,
	billing_units: 100,
	price: 10,
} as ProductItem;

const product = {
	id: "pro",
	items: [creditsItem],
	licenses: [{ product: { id: "editor" }, included: 2 }],
} as unknown as ProductV2;

const savedPlan = (
	overrides: Partial<CustomerStatePlan> = {},
): CustomerStatePlan => ({
	...EMPTY_CUSTOMER_STATE_PLAN,
	productId: "pro",
	version: 3,
	entityId: "workspace_a",
	...overrides,
});

describe("customerStatePlanToInvoicePlan", () => {
	test("copies a catalog plan with its version and scope", () => {
		expect(
			customerStatePlanToInvoicePlan({ plan: savedPlan(), product }),
		).toEqual({
			_id: expect.any(String),
			planId: "pro",
			version: 3,
			items: null,
			isCustom: false,
			featureQuantities: {},
			featureUsage: {},
			licenses: [],
			prorate: undefined,
			entityId: "workspace_a",
		});
	});

	test("keeps a customised plan's items rather than the catalog's", () => {
		const items = [{ ...creditsItem, price: 7 }];
		const invoicePlan = customerStatePlanToInvoicePlan({
			plan: savedPlan({ items, isCustom: true, entityId: null }),
			product,
		});

		expect(invoicePlan.items).toEqual(items);
		expect(invoicePlan.isCustom).toBe(true);
		expect(invoicePlan.entityId).toBeNull();
	});

	test("bills prepaid quantity without the included usage", () => {
		const invoicePlan = customerStatePlanToInvoicePlan({
			plan: savedPlan({ prepaidOptions: { credits: 600 } }),
			product,
		});

		expect(invoicePlan.featureQuantities).toEqual({ credits: 500 });
	});

	test("prices the included usage from the customised items", () => {
		const invoicePlan = customerStatePlanToInvoicePlan({
			plan: savedPlan({
				items: [{ ...creditsItem, included_usage: 300 }],
				isCustom: true,
				prepaidOptions: { credits: 600 },
			}),
			product,
		});

		expect(invoicePlan.featureQuantities).toEqual({ credits: 300 });
	});

	test("skips prepaid features with nothing paid", () => {
		const invoicePlan = customerStatePlanToInvoicePlan({
			plan: savedPlan({ prepaidOptions: { credits: 100 } }),
			product,
		});

		expect(invoicePlan.featureQuantities).toEqual({});
	});

	test("bills license seats without the included seats", () => {
		const invoicePlan = customerStatePlanToInvoicePlan({
			plan: savedPlan({ licenseQuantities: { editor: 5 } }),
			product,
		});

		expect(invoicePlan.licenses).toEqual([
			{
				_id: expect.any(String),
				licensePlanId: "editor",
				quantity: 3,
				featureQuantities: {},
				featureUsage: {},
				prorate: undefined,
			},
		]);
	});

	test("skips licenses that hold only their included seats", () => {
		const invoicePlan = customerStatePlanToInvoicePlan({
			plan: savedPlan({ licenseQuantities: { editor: 2 } }),
			product,
		});

		expect(invoicePlan.licenses).toEqual([]);
	});
});
