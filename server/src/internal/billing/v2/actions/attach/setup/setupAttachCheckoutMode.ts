import {
	type FullProduct,
	isFreeProduct,
	isOneOffProduct,
	type RedirectMode,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { CheckoutMode } from "@autumn/shared";

/**
 * Determines the checkout mode for attach operations.
 *
 * Checkout modes:
 * - `stripe_checkout`: Redirect to Stripe Checkout to collect payment method
 * - `autumn_checkout`: Redirect to Autumn confirmation page (has PM, but redirect_mode: "always")
 * - `null`: Direct billing (charge existing PM or no payment needed)
 *
 * Decision tree for redirect_mode: "when_required" (default):
 *
 * NO PAYMENT METHOD:
 *   A. Product is one-off → stripe_checkout (mode: "payment")
 *   B. No existing subscription + product is paid recurring → stripe_checkout (mode: "subscription")
 *   C. Existing subscription + product is paid recurring → direct billing (update sub, invoice open)
 *   D. Product is free → direct billing (no action needed)
 *
 * HAS PAYMENT METHOD:
 *   → Always direct billing (charge PM, handle failures via open invoice)
 *
 * redirect_mode: "always":
 *   → autumn_checkout (regardless of PM status) - NOT YET IMPLEMENTED
 */
export const setupAttachCheckoutMode = ({
	paymentMethod,
	redirectMode,
	attachProduct,
	stripeSubscription,
}: {
	paymentMethod?: Stripe.PaymentMethod;
	redirectMode?: RedirectMode;
	attachProduct: FullProduct;
	stripeSubscription?: Stripe.Subscription;
}): CheckoutMode => {
	const hasPaymentMethod = !!paymentMethod;
	const hasExistingSubscription = !!stripeSubscription;

	const prices = attachProduct.prices;
	const productIsOneOff = isOneOffProduct({ prices });
	const productIsFree = isFreeProduct({ prices });
	const productIsPaidRecurring = !productIsOneOff && !productIsFree;

	const getStripeCheckoutOrDirectBilling = () => {
		// A. if no payment method
		if (hasPaymentMethod) return null;

		if (productIsOneOff) return "stripe_checkout";

		if (!hasExistingSubscription && productIsPaidRecurring)
			return "stripe_checkout";

		return null;
	};

	const checkoutMode = getStripeCheckoutOrDirectBilling();

	if (checkoutMode === null && redirectMode === "always") {
		return "autumn_checkout";
	}

	return checkoutMode;
};
