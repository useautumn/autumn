import type { BillingResponseRequiredAction } from "@autumn/shared";
import type Stripe from "stripe";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice.js";

/**
 * Fetches invoice with expanded payments and determines the required action code.
 * When payment_behavior is "default_incomplete", Stripe doesn't throw an error -
 * instead it returns an invoice with a payment intent in a specific status.
 *
 * Payment intent statuses map to:
 * - requires_payment_method → payment_method_required
 * - requires_action → 3ds_required (needs customer authentication)
 * - requires_confirmation → 3ds_required (needs confirmation, typically 3DS)
 * - requires_capture → already authorized, should not reach here
 * - canceled/processing/succeeded → should not reach here for open invoices
 *
 * Falls back to payment_method_required for cases where we can't determine the status.
 */
export const getRequiredActionFromSubscriptionInvoice = async ({
	stripeClient,
	invoiceId,
	hasPaymentMethod,
}: {
	stripeClient: Stripe;
	invoiceId: string;
	hasPaymentMethod: boolean;
}): Promise<BillingResponseRequiredAction | undefined> => {
	// Fetch invoice with expanded payments to get payment intent status
	const invoice = await getStripeInvoice({
		stripeClient,
		invoiceId,
		expand: ["payments.data.payment.payment_intent"],
	});

	// If invoice is paid, no action required
	if (invoice.status === "paid") return undefined;

	// If invoice isn't open, no action required (could be draft, void, etc.)
	if (invoice.status !== "open") return undefined;

	// If no payment method on customer, that's the issue
	if (!hasPaymentMethod) {
		return {
			code: "payment_method_required",
			reason: "No payment method found",
		};
	}

	// Get payment intent from expanded payments (properly typed from getStripeInvoice)
	const firstPayment = invoice.payments?.data?.[0];
	const paymentIntent = firstPayment?.payment?.payment_intent;

	// No payment intent info available - default to payment_method_required
	// This happens with default_incomplete before payment is attempted
	if (!paymentIntent || typeof paymentIntent === "string") {
		return {
			code: "payment_method_required",
			reason: "Payment required",
		};
	}

	// Map payment intent status to required action code
	switch (paymentIntent.status) {
		case "requires_payment_method":
			// If there's a last_payment_error, a payment was attempted and failed
			// (e.g., card declined). Otherwise, no payment method was attached.
			if (paymentIntent.last_payment_error) {
				return {
					code: "payment_failed",
					reason: paymentIntent.last_payment_error.message ?? "Payment failed",
				};
			}
			return {
				code: "payment_method_required",
				reason: "Payment method required",
			};

		case "requires_action":
		case "requires_confirmation":
			return {
				code: "3ds_required",
				reason:
					paymentIntent.last_payment_error?.message ??
					"Additional authentication required",
			};

		case "canceled":
			return {
				code: "payment_failed",
				reason:
					paymentIntent.last_payment_error?.message ?? "Payment was canceled",
			};

		case "processing":
			// Payment is processing - not a failure, but not complete either
			return undefined;

		case "requires_capture":
		case "succeeded":
			// These statuses shouldn't occur for open invoices
			return undefined;

		default:
			// Unknown status - treat as payment failed
			return {
				code: "payment_failed",
				reason: `Unexpected payment intent status: ${paymentIntent.status}`,
			};
	}
};
