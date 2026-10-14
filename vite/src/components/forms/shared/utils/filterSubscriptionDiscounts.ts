import type { ApiDiscount } from "@autumn/shared";

export const filterSubscriptionDiscounts = <Discount extends ApiDiscount>({
	discounts,
	subscriptionIds,
}: {
	discounts: Discount[];
	subscriptionIds: string[];
}): Discount[] => {
	const ids = new Set(subscriptionIds);
	return discounts.filter(
		(discount) =>
			!!discount.subscription_id && ids.has(discount.subscription_id),
	);
};
