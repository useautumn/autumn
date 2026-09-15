import type Stripe from "stripe";

/** Gets the current phase index of a Stripe subscription schedule based on nowMs. */
export const stripeSubscriptionScheduleToPhaseIndex = ({
	stripeSubscriptionSchedule,
	nowMs,
}: {
	stripeSubscriptionSchedule: Stripe.SubscriptionSchedule;
	nowMs: number;
}): number => {
	const nowSeconds = Math.floor(nowMs / 1000);

	return stripeSubscriptionSchedule.phases.findIndex(
		(phase) =>
			phase.start_date <= nowSeconds &&
			(phase.end_date ? phase.end_date > nowSeconds : true),
	);
};

export const stripeSchedulePhaseItemToPriceId = (
	item: Stripe.SubscriptionSchedule.Phase.Item,
): string => (typeof item.price === "string" ? item.price : item.price.id);

/** Converts a live schedule phase item back into the shape an update accepts. */
export const stripeSchedulePhaseItemToUpdateParam = (
	item: Stripe.SubscriptionSchedule.Phase.Item,
): Stripe.SubscriptionScheduleUpdateParams.Phase.Item => ({
	price: stripeSchedulePhaseItemToPriceId(item),
	quantity: item.quantity ?? undefined,
});
