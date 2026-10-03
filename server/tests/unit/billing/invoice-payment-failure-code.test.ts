import { expect, test } from "bun:test";
import type Stripe from "stripe";
import { handleInvoicePaymentFailure } from "@/internal/billing/v2/providers/stripe/utils/invoices/handleInvoicePaymentFailure";

const invoice = { id: "in_123" } as Stripe.Invoice;

test("invoice payment requiring action maps to 3ds_required", () => {
	const error = Object.assign(new Error("requires action"), {
		type: "StripeInvalidRequestError",
		code: "invoice_payment_intent_requires_action",
		message:
			"The invoice payment requires additional action. Retrieve the invoice's PaymentIntent to complete the payment.",
	});

	expect(
		handleInvoicePaymentFailure({ invoice, error }).requiredAction?.code,
	).toBe("3ds_required");
});

test("a declined card stays payment_failed", () => {
	const error = Object.assign(new Error("declined"), {
		type: "StripeCardError",
		code: "card_declined",
		message: "Your card was declined.",
	});

	expect(
		handleInvoicePaymentFailure({ invoice, error }).requiredAction?.code,
	).toBe("payment_failed");
});
