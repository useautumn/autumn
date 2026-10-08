import { describe, expect, test } from "bun:test";
import { EMPTY_CUSTOMER_STATE_PLAN } from "@/components/forms/customer-state/customerStateSchema";
import {
	customerStatePlanToInvoicePlan,
	type InvoiceExistingPlan,
} from "./customerStatePlanToInvoicePlan";

const savedPlan = (
	overrides: Partial<InvoiceExistingPlan> = {},
): InvoiceExistingPlan => ({
	...EMPTY_CUSTOMER_STATE_PLAN,
	productId: "pro",
	version: 3,
	entityId: "workspace_a",
	paidFeatureQuantities: {},
	paidLicenseQuantities: {},
	...overrides,
});

describe("customerStatePlanToInvoicePlan", () => {
	test("copies a catalog plan with its version and scope", () => {
		expect(customerStatePlanToInvoicePlan({ plan: savedPlan() })).toEqual({
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
			period: null,
		});
	});

	test("keeps a customised plan's items rather than the catalog's", () => {
		const items = [{ feature_id: "credits", price: 7 }];
		const invoicePlan = customerStatePlanToInvoicePlan({
			plan: savedPlan({ items, isCustom: true, entityId: null }),
		});

		expect(invoicePlan.items).toEqual(items);
		expect(invoicePlan.isCustom).toBe(true);
		expect(invoicePlan.entityId).toBeNull();
	});

	test("bills the saved paid units, not the displayed totals", () => {
		const invoicePlan = customerStatePlanToInvoicePlan({
			plan: savedPlan({
				prepaidOptions: { credits: 2100 },
				paidFeatureQuantities: { credits: 200 },
			}),
		});

		expect(invoicePlan.featureQuantities).toEqual({ credits: 200 });
	});

	test("bills the saved paid seats, not the seat totals", () => {
		const invoicePlan = customerStatePlanToInvoicePlan({
			plan: savedPlan({
				licenseQuantities: { editor: 25 },
				paidLicenseQuantities: { viewer: 3 },
			}),
		});

		expect(invoicePlan.licenses).toEqual([
			{
				_id: expect.any(String),
				licensePlanId: "viewer",
				quantity: 3,
				featureQuantities: {},
				featureUsage: {},
				prorate: undefined,
			},
		]);
	});
});
