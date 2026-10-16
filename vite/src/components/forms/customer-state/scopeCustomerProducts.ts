import {
	type FullCusProduct,
	filterCustomerProductsByStripeSubscriptionScope,
} from "@autumn/shared";

/** The plans a customer-state form seeds from: every plan, or with a Stripe
 * subscription or schedule in focus, the ones on it plus plans no subscription bills. */
export const scopeCustomerProducts = ({
	customerProducts,
	stripeSubscriptionId,
	stripeScheduleId,
	unlinkedPlans,
}: {
	customerProducts: FullCusProduct[];
	stripeSubscriptionId?: string | null;
	stripeScheduleId?: string | null;
	unlinkedPlans?: "free" | "all";
}): FullCusProduct[] =>
	stripeSubscriptionId || stripeScheduleId
		? filterCustomerProductsByStripeSubscriptionScope({
				customerProducts,
				stripeSubscriptionId,
				stripeScheduleId,
				unlinkedPlans,
			})
		: customerProducts;
