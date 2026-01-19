import type Stripe from "stripe";
import { stripeSubscriptionScheduleToPhaseIndex } from "./convertStripeSubscriptionScheduleUtils";

/** Checks if a Stripe subscription schedule is in its last phase. */
export const isStripeSubscriptionScheduleInLastPhase = ({
	stripeSubscriptionSchedule,
	nowMs,
}: {
	stripeSubscriptionSchedule: Stripe.SubscriptionSchedule;
	nowMs: number;
}): boolean => {
	const currentPhaseIndex = stripeSubscriptionScheduleToPhaseIndex({
		stripeSubscriptionSchedule,
		nowMs,
	});

	return (
		currentPhaseIndex === stripeSubscriptionSchedule.phases.length - 1 &&
		stripeSubscriptionSchedule.status !== "released"
	);
};
