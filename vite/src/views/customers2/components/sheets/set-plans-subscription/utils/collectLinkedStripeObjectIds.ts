import { type FullCusProduct, STRIPE_LINKED_STATUSES } from "@autumn/shared";

export type LinkedStripeObjectIds = {
	subscriptionIds: string[];
	standaloneScheduleIds: string[];
};

export const isLiveCustomerProduct = (customerProduct: FullCusProduct) =>
	STRIPE_LINKED_STATUSES.includes(customerProduct.status);

const uniqueValues = (values: string[]) => [...new Set(values)];

/** Stripe subscriptions Autumn bills live plans on, plus schedules none of
 * those plans' subscriptions own (not-yet-started schedules). */
export const collectLinkedStripeObjectIds = ({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}): LinkedStripeObjectIds => {
	const liveCustomerProducts = customerProducts.filter(isLiveCustomerProduct);
	const subscriptionIds = uniqueValues(
		liveCustomerProducts.flatMap(
			(customerProduct) => customerProduct.subscription_ids ?? [],
		),
	);
	const scheduleIdsOwnedBySubscriptions = new Set(
		liveCustomerProducts
			.filter((customerProduct) => customerProduct.subscription_ids?.length)
			.flatMap((customerProduct) => customerProduct.scheduled_ids ?? []),
	);
	const standaloneScheduleIds = uniqueValues(
		liveCustomerProducts.flatMap(
			(customerProduct) => customerProduct.scheduled_ids ?? [],
		),
	).filter((scheduleId) => !scheduleIdsOwnedBySubscriptions.has(scheduleId));

	return { subscriptionIds, standaloneScheduleIds };
};

export const countLinkedStripeObjects = ({
	subscriptionIds,
	standaloneScheduleIds,
}: LinkedStripeObjectIds) =>
	subscriptionIds.length + standaloneScheduleIds.length;
