import {
	type FullCusProduct,
	filterCustomerProductsByStripeSubscriptionScope,
} from "@autumn/shared";

/** The plans a customer-state form seeds from: every plan, or with a Stripe
 * subscription or schedule in focus, the ones on it plus unlinked free plans. */
export const scopeCustomerProducts = ({
	customerProducts,
	stripeSubscriptionId,
	stripeScheduleId,
}: {
	customerProducts: FullCusProduct[];
	stripeSubscriptionId?: string | null;
	stripeScheduleId?: string | null;
}): FullCusProduct[] =>
	stripeSubscriptionId || stripeScheduleId
		? filterCustomerProductsByStripeSubscriptionScope({
				customerProducts,
				stripeSubscriptionId,
				stripeScheduleId,
			})
		: customerProducts;
