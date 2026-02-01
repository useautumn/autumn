import type { CheckoutMode } from "@autumn/shared";
import {
	type FullCusProduct,
	type FullProduct,
	isFreeProduct,
	isOneOffProduct,
	type RedirectMode,
} from "@autumn/shared";
import type Stripe from "stripe";

/**
 * Determines the checkout mode for attach operations.
 *
 */
export const setupAttachCheckoutMode = ({
	paymentMethod,
	redirectMode,
	attachProduct,
	currentCustomerProduct,
	stripeSubscription,
}: {
	paymentMethod?: Stripe.PaymentMethod;
	currentCustomerProduct?: FullCusProduct;
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
