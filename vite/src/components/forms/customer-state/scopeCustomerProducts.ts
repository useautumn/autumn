import {
	type FullCusProduct,
	filterCustomerProductsByStripeSubscriptionScope,
} from "@autumn/shared";

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
