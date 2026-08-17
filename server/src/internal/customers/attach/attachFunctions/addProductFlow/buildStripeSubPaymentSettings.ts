import type { InvoicePaymentMethod } from "@autumn/shared";
import type Stripe from "stripe";

export const buildStripeSubPaymentSettings = ({
	isCustomPaymentMethod,
	invoiceOnly,
	allowedPaymentMethods,
}: {
	isCustomPaymentMethod: boolean;
	invoiceOnly?: boolean;
	allowedPaymentMethods?: InvoicePaymentMethod[] | null;
}): Stripe.SubscriptionCreateParams.PaymentSettings | undefined => {
	const paymentSettings: Stripe.SubscriptionCreateParams.PaymentSettings = {};

	if (isCustomPaymentMethod) {
		// Save the custom PM on the sub so webhook handlers and renewals can find it.
		paymentSettings.save_default_payment_method = "on_subscription";
	}

	if (invoiceOnly && allowedPaymentMethods?.length) {
		paymentSettings.payment_method_types = allowedPaymentMethods;
	}

	return Object.keys(paymentSettings).length > 0 ? paymentSettings : undefined;
};
