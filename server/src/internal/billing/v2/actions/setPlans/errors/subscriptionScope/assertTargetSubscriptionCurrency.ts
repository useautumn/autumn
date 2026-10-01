import {
	type CreateScheduleBillingContext,
	ErrCode,
	isFreeProduct,
	RecaseError,
} from "@autumn/shared";
import { requestedPlans } from "./requestedPlans";

/** Paid plans bill on the targeted subscription, so they must share its currency. */
export const assertTargetSubscriptionCurrency = ({
	billingContext,
}: {
	billingContext: CreateScheduleBillingContext;
}) => {
	const { stripeSubscriptionScope, stripeSubscription, currency } =
		billingContext;
	if (!stripeSubscriptionScope || !stripeSubscription || !currency) return;

	const requestsPaidPlan = requestedPlans({ billingContext }).some(
		({ fullProduct }) => !isFreeProduct({ product: fullProduct }),
	);
	const subscriptionCurrency = stripeSubscription.currency.toLowerCase();
	if (!requestsPaidPlan || subscriptionCurrency === currency.toLowerCase()) {
		return;
	}

	throw new RecaseError({
		code: ErrCode.CurrencyMismatch,
		message: `Subscription ${stripeSubscription.id} bills in ${subscriptionCurrency.toUpperCase()}, so plans can't be billed on it in ${currency.toUpperCase()}.`,
		statusCode: 400,
	});
};
