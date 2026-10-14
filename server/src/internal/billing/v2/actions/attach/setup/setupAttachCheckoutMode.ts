import type { CheckoutMode, InvoiceMode, TrialContext } from "@autumn/shared";
import {
	type FullProduct,
	isFreeProduct,
	isOneOffProduct,
	type RedirectMode,
} from "@autumn/shared";
import type Stripe from "stripe";

export const setupAttachCheckoutMode = ({
	paymentMethod,
	redirectMode,
	attachProduct,
	stripeSubscription,
	trialContext,
	invoiceMode,
	hasFutureStartDate,
}: {
	paymentMethod?: Stripe.PaymentMethod;
	redirectMode?: RedirectMode;
	attachProduct: FullProduct;
	stripeSubscription?: Stripe.Subscription;
	trialContext?: TrialContext;
	invoiceMode?: InvoiceMode;
	hasFutureStartDate?: boolean;
}): CheckoutMode => {
	const hasPaymentMethod = !!paymentMethod;
	const hasExistingSubscription = !!stripeSubscription;

	const productIsOneOff = isOneOffProduct({ product: attachProduct });
	const productIsFree = isFreeProduct({ product: attachProduct });
	const productIsPaidRecurring = !productIsOneOff && !productIsFree;

	if (redirectMode === "never") {
		return null;
	}

	if (invoiceMode) {
		return null;
	}

	if (hasFutureStartDate) {
		return null;
	}

	const getStripeCheckoutOrDirectBilling = () => {
		if (hasPaymentMethod) return null;

		if (productIsOneOff) return "stripe_checkout";

		if (!hasExistingSubscription && productIsPaidRecurring) {
			if (trialContext?.trialEndsAt && trialContext?.cardRequired === false) {
				return null;
			}
			return "stripe_checkout";
		}

		return null;
	};

	const checkoutMode = getStripeCheckoutOrDirectBilling();

	if (checkoutMode === null && redirectMode === "always") {
		if (productIsOneOff) return "stripe_checkout";

		if (productIsPaidRecurring && !hasExistingSubscription) {
			return "stripe_checkout";
		}

		return "autumn_checkout";
	}

	return checkoutMode;
};
