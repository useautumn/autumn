import type { ApiDiscount } from "@autumn/shared";

/** Discounts on one of these subscriptions; customer-level coupons stay on the customer, so they're excluded. */
export const filterSubscriptionDiscounts = ({
	discounts,
	subscriptionIds,
}: {
	discounts: ApiDiscount[];
	subscriptionIds: string[];
}): ApiDiscount[] => {
	const ids = new Set(subscriptionIds);
	return discounts.filter(
		(discount) =>
			!!discount.subscription_id && ids.has(discount.subscription_id),
	);
};
