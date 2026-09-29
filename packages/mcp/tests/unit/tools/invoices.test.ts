import { expect, test } from "bun:test";
import { InvoiceStatus } from "@autumn/shared";
import { createRawAutumnOperationTools } from "../../../src/tools/index.js";
import {
	invoices,
	summarizeStripeInvoice,
} from "../../../src/tools/invoices.js";

test("listInvoices accepts a stripe_id filter", () => {
	const parsed = invoices.schemas.listInvoices.parse({
		customer_id: "customer_123",
		stripe_id: "in_123",
		status: [InvoiceStatus.Open],
	});

	expect(parsed.stripe_id).toBe("in_123");
	expect(parsed.status).toEqual([InvoiceStatus.Open]);
});

test("invoice tools are registered in the MCP toolset", () => {
	const tools = createRawAutumnOperationTools({ requireIntent: false });

	expect(tools.listInvoices).toBeDefined();
	expect(tools.getStripeInvoice).toBeDefined();
});

test("summarizeStripeInvoice keeps payment state and drops everything else", () => {
	const summary = summarizeStripeInvoice({
		id: "in_123",
		object: "invoice",
		number: "TNUX5UAX-0003",
		status: "open",
		collection_method: "charge_automatically",
		billing_reason: "subscription_cycle",
		currency: "usd",
		total: 2000,
		amount_due: 2000,
		amount_paid: 0,
		amount_remaining: 2000,
		attempted: true,
		attempt_count: 2,
		next_payment_attempt: 1790000000,
		auto_advance: true,
		customer: {
			id: "cus_123",
			email: "billing@example.com",
			name: "Example",
			tax_ids: { data: [] },
		},
		status_transitions: {
			finalized_at: 1789000000,
			paid_at: null,
			voided_at: null,
			marked_uncollectible_at: null,
		},
		lines: { data: [{ id: "il_1" }] },
		payments: {
			data: [
				{
					status: "failed",
					payment: {
						type: "payment_intent",
						payment_intent: {
							id: "pi_123",
							status: "requires_payment_method",
							client_secret: "pi_123_secret",
							last_payment_error: {
								type: "card_error",
								code: "card_declined",
								decline_code: "insufficient_funds",
								message: "Your card has insufficient funds.",
								payment_method: { id: "pm_123" },
							},
						},
					},
				},
			],
		},
	});

	expect(summary).not.toHaveProperty("lines");
	expect(summary.customer).toEqual({
		id: "cus_123",
		email: "billing@example.com",
		name: "Example",
	});
	expect(summary.attempt_count).toBe(2);

	const paymentIntent = summary.payments?.data[0]?.payment?.payment_intent;
	expect(paymentIntent).toEqual({
		id: "pi_123",
		status: "requires_payment_method",
		last_payment_error: {
			type: "card_error",
			code: "card_declined",
			decline_code: "insufficient_funds",
			message: "Your card has insufficient funds.",
		},
	});
});
