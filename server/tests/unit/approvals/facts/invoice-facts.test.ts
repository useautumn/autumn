import { describe, expect, test } from "bun:test";
import type { ApprovalCustomerFacts } from "@autumn/shared/api/approvals/evaluate/index.js";
import { invoicePreviewToFacts } from "@/internal/approvals/facts/invoices/invoicePreviewToFacts";
import { invoiceToFacts } from "@/internal/approvals/facts/invoices/invoiceToFacts";

const customer = {
	id: "cus_1",
	customer_products: [],
	has_paid: true,
} as unknown as ApprovalCustomerFacts;

describe("invoice facts", () => {
	test("an existing invoice is judged on its total, with no credit unless one is issued", () => {
		expect(invoiceToFacts({ customer, invoice: { total: 120 } })).toEqual({
			customer,
			total: 120,
			refund: null,
		});
	});

	test("a credit note carries the amount it credits", () => {
		expect(
			invoiceToFacts({ customer, invoice: { total: 120 }, creditAmount: 15 }),
		).toEqual({ customer, total: 120, refund: { amount: 15 } });
	});

	test("a new or reissued invoice is judged on its preview's total", () => {
		expect(
			invoicePreviewToFacts({ customer, preview: { total: 42.5 } }),
		).toEqual({ customer, total: 42.5, refund: null });
	});
});
