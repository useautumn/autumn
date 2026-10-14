import type Stripe from "stripe";
import type { PayInvoiceResult } from "./payStripeInvoice";

const getFailureCodeFromStripeError = ({
	stripeError,
}: {
	stripeError: Stripe.errors.StripeError;
}): "3ds_required" | "payment_failed" => {
	const authCodes = [
		"authentication_required",
		"authentication_not_handled",
		"invoice_payment_intent_requires_action",
	];

	if (authCodes.includes(stripeError.code ?? "")) {
		return "3ds_required";
	}

	// Check message for 3DS indicators (Stripe doesn't always set the code)
	const message = stripeError.message?.toLowerCase() ?? "";
	if (
		message.includes("additional user action") ||
		message.includes("authentication") ||
		message.includes("3d secure")
	) {
		return "3ds_required";
	}

	return "payment_failed";
};

export const handleInvoicePaymentFailure = ({
	invoice,
	error,
}: {
	invoice: Stripe.Invoice;
	error: Error | "no_payment_method";
}): PayInvoiceResult => {
	if (error === "no_payment_method") {
		return {
			paid: false,
			invoice,
			requiredAction: {
				code: "payment_method_required",
				reason: "No payment method found",
			},
		};
	}

	const stripeError = error as Stripe.errors.StripeError;
	const isStripeError = stripeError.type !== undefined;

	if (!isStripeError) throw error;

	return {
		paid: false,
		invoice,
		requiredAction: {
			code: getFailureCodeFromStripeError({ stripeError }),
			reason: stripeError.message ?? "Failed to pay invoice",
		},
		stripeError,
	};
};
