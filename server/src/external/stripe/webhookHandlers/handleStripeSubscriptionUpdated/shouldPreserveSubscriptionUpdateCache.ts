import type Stripe from "stripe";
import { isAutumnOriginatedStripeEvent } from "@/external/stripe/common/autumnStripeIdempotency";
import type { StripeSubscriptionUpdatedContext } from "./stripeSubscriptionUpdatedContext";

export const shouldPreserveSubscriptionUpdateCache = ({
	event,
	eventContext,
}: {
	event: Stripe.CustomerSubscriptionUpdatedEvent;
	eventContext: StripeSubscriptionUpdatedContext;
}): boolean => {
	if (!isAutumnOriginatedStripeEvent({ event })) return false;
	const { results } = eventContext;

	const hasProductChanges =
		eventContext.updatedCustomerProducts.length > 0 ||
		eventContext.insertedCustomerProducts.length > 0 ||
		eventContext.deletedCustomerProducts.length > 0 ||
		(results.repairedCustomerProducts?.length ?? 0) > 0;
	const hasOtherResults =
		results.subscription !== undefined ||
		results.autoSync !== undefined ||
		results.pooledBalances !== undefined ||
		results.stripeSubscription !== undefined;
	const hasErrors = results.errors.length > 0;

	return !hasProductChanges && !hasOtherResults && !hasErrors;
};
