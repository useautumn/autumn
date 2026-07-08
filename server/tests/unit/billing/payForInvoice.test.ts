// Red: open invoice.pay result flowed through Stripe failure cleanup and voided.
// Green: open invoice result throws without voiding an in-flight ACH invoice.
import { describe, expect, test } from "bun:test";
import { payForInvoice } from "@/external/stripe/stripeInvoiceUtils";

describe("payForInvoice", () => {
	test("does not void an open invoice returned by invoice.pay", async () => {
		const invoice = { id: "in_123", status: "open" };
		let voidCalls = 0;

		await expect(
			payForInvoice({
				stripeCli: {
					invoices: {
						retrieve: async () => invoice,
						pay: async () => invoice,
						voidInvoice: async () => {
							voidCalls += 1;
						},
					},
				} as never,
				paymentMethod: { id: "pm_123" } as never,
				invoiceId: invoice.id,
				logger: { info: () => {}, error: () => {} },
				errorOnFail: true,
				voidIfFailed: true,
			}),
		).rejects.toThrow("Invoice in_123 is open");

		expect(voidCalls).toBe(0);
	});
});
