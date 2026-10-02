import {
	type CheckoutMode,
	type CreateScheduleBillingContext,
	isOneOffProduct,
	isProductPaidAndRecurring,
	type SetPlansParamsV0,
} from "@autumn/shared";

type SetPlansCheckoutModeContext = Pick<
	CreateScheduleBillingContext,
	| "fullProducts"
	| "paymentMethod"
	| "stripeSubscription"
	| "trialContext"
	| "invoiceMode"
	| "skipBillingChanges"
>;

export const setupSetPlansCheckoutMode = ({
	billingContext,
	redirectMode,
	startsInFuture = false,
}: {
	billingContext: SetPlansCheckoutModeContext;
	redirectMode: SetPlansParamsV0["redirect_mode"];
	startsInFuture?: boolean;
}): CheckoutMode => {
	const bypassesCheckout =
		billingContext.skipBillingChanges ||
		redirectMode === "never" ||
		billingContext.invoiceMode ||
		startsInFuture;
	if (bypassesCheckout) {
		return null;
	}

	const hasPaymentMethod = !!billingContext.paymentMethod;
	const hasExistingSubscription = !!billingContext.stripeSubscription;
	const hasOneOffProduct = billingContext.fullProducts.some((product) =>
		isOneOffProduct({ product }),
	);
	const hasPaidRecurringProduct = billingContext.fullProducts.some(
		isProductPaidAndRecurring,
	);
	const shouldUseStripeCheckout =
		hasOneOffProduct || (!hasExistingSubscription && hasPaidRecurringProduct);

	if (!hasPaymentMethod && shouldUseStripeCheckout) {
		const noCardRequiredTrial =
			billingContext.trialContext?.trialEndsAt &&
			billingContext.trialContext.cardRequired === false;

		return noCardRequiredTrial ? null : "stripe_checkout";
	}

	if (redirectMode === "always") {
		return shouldUseStripeCheckout ? "stripe_checkout" : "autumn_checkout";
	}

	return null;
};
