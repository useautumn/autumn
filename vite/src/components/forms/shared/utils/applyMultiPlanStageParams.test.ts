import { describe, expect, test } from "bun:test";
import type { SetPlansParamsV0 } from "@autumn/shared";
import { applyMultiPlanStageParams } from "./applyMultiPlanStageParams";

const requestBody = { customer_id: "cus_1" } as SetPlansParamsV0;

describe("applyMultiPlanStageParams", () => {
	test("sends the chosen payment methods on invoice_mode", () => {
		const body = applyMultiPlanStageParams({
			requestBody,
			useInvoice: true,
			netTermsDays: 30,
			paymentMethodTypes: ["card", "us_bank_account"],
		});
		expect(body?.invoice_mode?.payment_method_types).toEqual([
			"card",
			"us_bank_account",
		]);
		expect(body?.invoice_mode?.net_terms_days).toBe(30);
	});

	test("leaves payment methods to the org default when none are chosen", () => {
		const body = applyMultiPlanStageParams({ requestBody, useInvoice: true });
		expect(body?.invoice_mode).not.toHaveProperty("payment_method_types");
	});
});
