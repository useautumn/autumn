// Red: open invoice.pay result returned payment_failed.
// Green: it returns payment_processing because ACH is still settling.
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
					pay: async (
						invoiceId: string,
						params: { payment_method: string },
					) => {
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

	test("returns payment_processing when invoice pay leaves invoice open", async () => {
		const invoice = { id: "in_processing", status: "open" };
		const paymentMethod = { id: "pm_123" };

		const result = await payStripeInvoice({
			stripeCli: {
				invoices: {
					pay: async () => ({ ...invoice, status: "open" }),
				},
			} as never,
			invoice: invoice as never,
			paymentMethod: paymentMethod as never,
		});

		expect(result.paid).toBe(false);
		expect(result.requiredAction?.code).toBe("payment_processing");
		expect(result.invoice.status).toBe("open");
	});

	test("returns payment_failed when invoice pay returns a terminal status", async () => {
		const invoice = { id: "in_terminal", status: "open" };
		const paymentMethod = { id: "pm_123" };

		const result = await payStripeInvoice({
			stripeCli: {
				invoices: {
					pay: async () => ({ ...invoice, status: "void" }),
				},
			} as never,
			invoice: invoice as never,
			paymentMethod: paymentMethod as never,
		});

		expect(result.paid).toBe(false);
		expect(result.requiredAction?.code).toBe("payment_failed");
		expect(result.invoice.status).toBe("void");
	});
});
