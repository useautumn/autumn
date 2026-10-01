import {
	type CreateScheduleBillingContext,
	ErrCode,
	isFreeProduct,
} from "@autumn/shared";
import { setPlansError } from "../setPlansError";
import { requestedPlans } from "./requestedPlans";
import { stripeSubscriptionPlanName } from "./subscriptionScopeErrors";

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

	throw setPlansError({
		code: ErrCode.CurrencyMismatch,
		details: {
			type: "currency_mismatch",
			subscription_plan_name: stripeSubscriptionPlanName({
				customerProducts: billingContext.fullCustomer.customer_products,
				stripeSubscriptionId: stripeSubscription.id,
			}),
			subscription_currency: subscriptionCurrency,
			requested_currency: currency,
		},
	});
};
