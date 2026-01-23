import type { CheckoutMode, RedirectMode } from "@autumn/shared";
import type Stripe from "stripe";

/**
 * Determines the checkout mode based on payment method availability and redirect preference.
 */
export const setupAttachCheckoutMode = ({
	paymentMethod,
	redirectMode,
}: {
	paymentMethod?: Stripe.PaymentMethod;
	redirectMode?: RedirectMode;
}): CheckoutMode => {
	const hasPaymentMethod = !!paymentMethod;

	if (!hasPaymentMethod) return "stripe_checkout";
	if (redirectMode === "always") return "autumn_checkout";
	return null;
};
