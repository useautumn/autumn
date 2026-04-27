import { describe, expect, test } from "bun:test";
import { payStripeInvoice } from "@/internal/billing/v2/providers/stripe/utils/invoices/payStripeInvoice";

describe("payStripeInvoice", () => {
	test("pays the provided invoice without retrieving it first", async () => {
		const invoice = { id: "in_123", status: "open" };
		const paymentMethod = { id: "pm_123" };
		let retrieveCalls = 0;
		let payCalls = 0;

		const result = await payStripeInvoice({
			stripeCli: {
				invoices: {
					retrieve: async () => {
						retrieveCalls += 1;
						throw new Error("invoice retrieve should not be called");
					},
					pay: async (invoiceId: string, params: { payment_method: string }) => {
						payCalls += 1;
						expect(invoiceId).toBe(invoice.id);
						expect(params.payment_method).toBe(paymentMethod.id);
						return { id: invoice.id, status: "paid" };
					},
				},
			} as never,
			invoice: invoice as never,
			paymentMethod: paymentMethod as never,
		});

		expect(result.paid).toBe(true);
		expect(result.invoice.id).toBe("in_123");
		expect(result.invoice.status).toBe("paid");
		expect(retrieveCalls).toBe(0);
		expect(payCalls).toBe(1);
	});
});
