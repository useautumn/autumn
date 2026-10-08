import { describe, expect, test } from "bun:test";
import type { ProductV2 } from "@autumn/shared";
import {
	type CustomerStatePlan,
	EMPTY_CUSTOMER_STATE_PLAN,
} from "@/components/forms/customer-state/customerStateSchema";
import {
	EMPTY_INVOICE_PLAN,
	type FormInvoicePlan,
} from "../createInvoiceFormSchema";
import { copyExistingPlansIntoInvoice } from "./copyExistingPlansIntoInvoice";

const productsById = new Map(
	["pro", "addon"].map((id) => [id, { id, items: [] } as unknown as ProductV2]),
);

const existing = (
	productId: string,
	entityId: string | null,
): CustomerStatePlan => ({ ...EMPTY_CUSTOMER_STATE_PLAN, productId, entityId });

const invoicePlan = (
	_id: string,
	planId: string,
	entityId: string | null,
): FormInvoicePlan => ({ ...EMPTY_INVOICE_PLAN, _id, planId, entityId });

const rows = (plans: FormInvoicePlan[] | null) =>
	plans?.map(({ planId, entityId }) => [planId, entityId]);

const existingPlans = [
	existing("pro", "workspace_a"),
	existing("addon", null),
	existing("pro", "workspace_b"),
];

describe("copyExistingPlansIntoInvoice", () => {
	test("replaces the picker row with the selected scope's plans", () => {
		const plans = copyExistingPlansIntoInvoice({
			plans: [invoicePlan("1", "addon", null), invoicePlan("2", "", null)],
			planIndex: 1,
			entityId: "workspace_a",
			existingPlans,
			productsById,
		});

		expect(rows(plans)).toEqual([
			["addon", null],
			["pro", "workspace_a"],
		]);
	});

	test("skips plans the invoice already holds at that scope", () => {
		const plans = copyExistingPlansIntoInvoice({
			plans: [
				invoicePlan("1", "pro", "workspace_a"),
				invoicePlan("2", "", "workspace_a"),
			],
			planIndex: 1,
			entityId: "workspace_a",
			existingPlans: [...existingPlans, existing("addon", "workspace_a")],
			productsById,
		});

		expect(rows(plans)).toEqual([
			["pro", "workspace_a"],
			["addon", "workspace_a"],
		]);
	});

	test("customer-level falls back to the first entity holding plans", () => {
		const plans = copyExistingPlansIntoInvoice({
			plans: [invoicePlan("1", "", null)],
			planIndex: 0,
			entityId: null,
			existingPlans: [existing("pro", "workspace_b")],
			productsById,
		});

		expect(rows(plans)).toEqual([["pro", "workspace_b"]]);
	});

	test("returns null when the scope has nothing left to copy", () => {
		expect(
			copyExistingPlansIntoInvoice({
				plans: [
					invoicePlan("1", "pro", "workspace_b"),
					invoicePlan("2", "", "workspace_b"),
				],
				planIndex: 1,
				entityId: "workspace_b",
				existingPlans,
				productsById,
			}),
		).toBeNull();
	});
});
