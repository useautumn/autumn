import {
	CusProductStatus,
	type FullCusProduct,
	isCustomerProductOnStripeSubscriptionSchedule,
} from "@autumn/shared";

export const findQueuedCustomerProducts = ({
	customerProducts,
	autumnScheduledCustomerProductIds,
	stripeScheduleId,
}: {
	customerProducts: FullCusProduct[];
	autumnScheduledCustomerProductIds: ReadonlySet<string>;
	stripeScheduleId?: string;
}): FullCusProduct[] =>
	customerProducts.filter(
		(customerProduct) =>
			customerProduct.status === CusProductStatus.Scheduled &&
			(autumnScheduledCustomerProductIds.has(customerProduct.id) ||
				isCustomerProductOnStripeSubscriptionSchedule({
					customerProduct,
					stripeSubscriptionScheduleId: stripeScheduleId,
				})),
	);
