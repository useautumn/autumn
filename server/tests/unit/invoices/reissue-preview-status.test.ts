import { describe, expect, mock, test } from "bun:test";
import Stripe from "stripe";
import type { ExpandedStripeCustomer } from "@/external/stripe/customers/operations/getExpandedStripeCustomer";
import { previewReissue } from "@/internal/invoices/actions/reissue/previewReissue";

describe("reissue automatic tax preview status", () => {
	for (const status of [
		"requires_location_inputs",
		"failed",
		null,
		"complete",
	] as const) {
		test(`only accepts a completed tax calculation: ${status}`, async () => {
			const invoiceFields: Partial<Stripe.Invoice> = {
				id: "in_test",
				currency: "usd",
				automatic_tax: {
					enabled: true,
					status,
					disabled_reason: null,
					liability: null,
					provider: null,
				},
				default_tax_rates: [],
				lines: { object: "list", url: "/lines", data: [], has_more: false },
				subtotal: 2000,
				total: 2000,
				total_taxes: [],
			};
			const stripeInvoice = invoiceFields as Stripe.Invoice;
			const createPreview = mock(async () => stripeInvoice);
			const stripeCli = Object.assign(new Stripe("sk_test_unit"), {
				invoices: { createPreview },
			});
			const result = previewReissue({
				stripeCli,
				stripeInvoice,
				stripeCustomer: {
					id: "cus_test",
					address: { country: "GB" },
				} as ExpandedStripeCustomer,
				customerOverrides: { tax_ids: [] },
				lines: [],
				storedLines: [],
				dueDateMs: null,
			});
			if (status === "complete") {
				expect((await result).total).toBe(20);
			} else {
				await expect(result).rejects.toThrow(
					status === "requires_location_inputs"
						? "tax location"
						: "could not complete",
				);
			}
			expect(createPreview).toHaveBeenCalledTimes(1);
		});
	}
});
