import {
	type CheckoutMode,
	type CreateScheduleBillingContext,
	isFreeProduct,
	isOneOffProduct,
	isProductPaidAndRecurring,
	type SetPlansParamsV0,
} from "@autumn/shared";
import { resolveUnscheduledProductContexts } from "../utils/unscheduledProductContexts";

type SetPlansCheckoutModeContext = Pick<
	CreateScheduleBillingContext,
	| "fullProducts"
	| "productContexts"
	| "paymentMethod"
	| "stripeSubscription"
	| "trialContext"
	| "invoiceMode"
	| "skipBillingChanges"
>;

/** A later first phase bills only its ongoing plans now. */
const productsChargedNow = ({
	billingContext,
	startsInFuture,
}: {
	billingContext: SetPlansCheckoutModeContext;
	startsInFuture: boolean;
}) =>
	startsInFuture
		? resolveUnscheduledProductContexts({
				productContexts: billingContext.productContexts,
			}).map(({ fullProduct }) => fullProduct)
		: billingContext.fullProducts;

export const setupSetPlansCheckoutMode = ({
	billingContext,
	redirectMode,
	startsInFuture,
}: {
	billingContext: SetPlansCheckoutModeContext;
	redirectMode: SetPlansParamsV0["redirect_mode"];
	startsInFuture: boolean;
}): CheckoutMode => {
	const chargedProducts = productsChargedNow({
		billingContext,
		startsInFuture,
	});
	const chargesNothingNow =
		startsInFuture &&
		chargedProducts.every((product) => isFreeProduct({ product }));
	const bypassesCheckout =
		billingContext.skipBillingChanges ||
		redirectMode === "never" ||
		billingContext.invoiceMode ||
		chargesNothingNow;
	if (bypassesCheckout) {
		return null;
	}

	const hasPaymentMethod = !!billingContext.paymentMethod;
	const hasExistingSubscription = !!billingContext.stripeSubscription;
	const hasOneOffProduct = chargedProducts.some((product) =>
		isOneOffProduct({ product }),
	);
	const hasPaidRecurringProduct = chargedProducts.some(
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
