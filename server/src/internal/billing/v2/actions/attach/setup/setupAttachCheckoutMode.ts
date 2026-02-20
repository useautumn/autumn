import type { CheckoutMode, InvoiceMode, TrialContext } from "@autumn/shared";
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
	trialContext,
	invoiceMode,
}: {
	paymentMethod?: Stripe.PaymentMethod;
	currentCustomerProduct?: FullCusProduct;
	redirectMode?: RedirectMode;
	attachProduct: FullProduct;
	stripeSubscription?: Stripe.Subscription;
	trialContext?: TrialContext;
	invoiceMode?: InvoiceMode;
}): CheckoutMode => {
	const hasPaymentMethod = !!paymentMethod;
	const hasExistingSubscription = !!stripeSubscription;

	const prices = attachProduct.prices;
	const productIsOneOff = isOneOffProduct({ prices });
	const productIsFree = isFreeProduct({ prices });
	const productIsPaidRecurring = !productIsOneOff && !productIsFree;

	if (redirectMode === "never") {
		return null;
	}

	const getStripeCheckoutOrDirectBilling = () => {
		// If invoice mode

		// A. if no payment method
		if (hasPaymentMethod || invoiceMode) return null;

		if (productIsOneOff) return "stripe_checkout";

		if (!hasExistingSubscription && productIsPaidRecurring) {
			// If trial no card required, direct billing
			if (trialContext?.trialEndsAt && trialContext?.cardRequired === false) {
				return null;
			}
			return "stripe_checkout";
		}

		return null;
	};

	const checkoutMode = getStripeCheckoutOrDirectBilling();

	if (checkoutMode === null && redirectMode === "always") {
		// 1. If it's one off product, return stripe_checkout
		if (productIsOneOff) return "stripe_checkout";

		// 2. If it's paid recurring and no subscription, return autumn_checkout
		if (productIsPaidRecurring && !hasExistingSubscription) {
			return "stripe_checkout";
		}

		return "autumn_checkout";
	}

	return checkoutMode;
};
