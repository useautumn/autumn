import type Stripe from "stripe";
import { stripeSubscriptionScheduleToPhaseIndex } from "./convertStripeSubscriptionScheduleUtils";

/** Checks if a Stripe subscription schedule phase is current. */
export const isStripeSubscriptionSchedulePhaseCurrent = ({
	phase,
	nowSeconds,
}: {
	phase: Stripe.SubscriptionSchedule.Phase;
	nowSeconds: number;
}): boolean => {
	if (nowSeconds < phase.start_date) return false;
	if (phase.end_date && nowSeconds >= phase.end_date) return false;
	return true;
};

/** Stripe keeps completed phases on an active schedule. */
export const isStripeSubscriptionSchedulePhaseEnded = ({
	phase,
	nowSeconds,
}: {
	phase: Stripe.SubscriptionSchedule.Phase;
	nowSeconds: number;
}): boolean => phase.end_date != null && nowSeconds >= phase.end_date;

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
