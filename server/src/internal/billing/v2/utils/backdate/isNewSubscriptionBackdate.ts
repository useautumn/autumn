import type { BillingContext } from "@autumn/shared";
import { isBackdateRecreate } from "@/internal/billing/v2/actions/setPlans/utils/isBackdateRecreate";

/** A new Stripe subscription started in the past, which Stripe bills for its elapsed cycles at creation. */
export const isNewSubscriptionBackdate = ({
	billingContext,
}: {
	billingContext: Pick<
		BillingContext,
		| "subscriptionBackdateStartMs"
		| "stripeSubscription"
		| "replacedStripeSubscription"
	>;
}) =>
	billingContext.subscriptionBackdateStartMs !== undefined &&
	!billingContext.stripeSubscription &&
	!isBackdateRecreate({ billingContext });
