import type Stripe from "stripe";
import type { PayInvoiceResult } from "./payStripeInvoice";

// ============================================
// Helpers
// ============================================

/**
 * Maps Stripe error codes to payment failure codes.
 * Returns "3ds_required" for authentication errors, "payment_failed" for all others.
 */
const getFailureCodeFromStripeError = ({
	stripeError,
}: {
	stripeError: Stripe.errors.StripeError;
}): "3ds_required" | "payment_failed" => {
	const authCodes = ["authentication_required", "authentication_not_handled"];

	if (authCodes.includes(stripeError.code ?? "")) {
		return "3ds_required";
	}

	return "payment_failed";
};

// ============================================
// Handle Payment Failure
// ============================================

/**
 * Builds a failed PayInvoiceResult from an invoice and error.
 * Handles "no_payment_method" and Stripe errors - throws non-Stripe errors.
 */
export const handleInvoicePaymentFailure = ({
	invoice,
	error,
}: {
	invoice: Stripe.Invoice;
	error: Error | "no_payment_method";
}): PayInvoiceResult => {
	// 1. No payment method case
	if (error === "no_payment_method") {
		return {
			paid: false,
			invoice,
			actionRequired: {
				code: "payment_method_required",
				reason: "No payment method found",
			},
		};
	}

	// 2. Check if it's a Stripe error
	const stripeError = error as Stripe.errors.StripeError;
	const isStripeError = stripeError.type !== undefined;

	if (!isStripeError) throw error;

	// 3. Handle Stripe errors
	return {
		paid: false,
		invoice,
		actionRequired: {
			code: getFailureCodeFromStripeError({ stripeError }),
			reason: stripeError.message ?? "Failed to pay invoice",
		},
		stripeError,
	};
};
