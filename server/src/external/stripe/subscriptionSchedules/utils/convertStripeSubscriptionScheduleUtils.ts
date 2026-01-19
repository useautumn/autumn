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
