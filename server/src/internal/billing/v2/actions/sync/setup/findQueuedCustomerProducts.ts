import {
	CusProductStatus,
	type FullCusProduct,
	isCustomerProductOnStripeSubscriptionSchedule,
} from "@autumn/shared";

/** Scheduled rows this sync replaces. Imported rows can sit on the Stripe
 * schedule with no Autumn schedule listing them, so either link counts. */
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
