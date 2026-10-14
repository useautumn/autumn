import type {
	BillingResponseRequiredAction,
	InvoiceMode,
} from "@autumn/shared";
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
	invoiceMode,
	enablePlanImmediately,
}: {
	stripeClient: Stripe;
	invoiceId: string;
	hasPaymentMethod: boolean;
	invoiceMode?: InvoiceMode;
	enablePlanImmediately?: boolean;
}): Promise<BillingResponseRequiredAction | undefined> => {
	if (invoiceMode?.enableProductImmediately) return undefined;
	if (enablePlanImmediately) return undefined;

	const invoice = await getStripeInvoice({
		stripeClient,
		invoiceId,
		expand: ["payments.data.payment.payment_intent"],
	});

	if (invoice.status === "paid") return undefined;

	if (invoice.status !== "open") return undefined;

	if (!hasPaymentMethod) {
		return {
			code: "payment_method_required",
			reason: "No payment method found",
		};
	}

	const firstPayment = invoice.payments?.data?.[0];
	const paymentIntent = firstPayment?.payment?.payment_intent;

	if (!paymentIntent || typeof paymentIntent === "string") {
		return {
			code: "payment_method_required",
			reason: "Payment required",
		};
	}

	switch (paymentIntent.status) {
		case "requires_payment_method":
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
			return undefined;

		case "requires_capture":
		case "succeeded":
			return undefined;

		default:
			return {
				code: "payment_failed",
				reason: `Unexpected payment intent status: ${paymentIntent.status}`,
			};
	}
};
