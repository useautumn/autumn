import { secondsToMilliseconds } from "date-fns";
import type Stripe from "stripe";
import { schedulePhaseItemShape } from "@/external/stripe/subscriptionSchedules/utils/schedulePhaseItemShape";

/** The live schedule already runs these phases: same current and future phases, start dates, items and end behavior. */
export const stripeScheduleMatchesPhases = ({
	schedule,
	phases,
	endBehavior,
	nowMs,
}: {
	schedule: Stripe.SubscriptionSchedule;
	phases: Stripe.SubscriptionScheduleUpdateParams.Phase[];
	endBehavior: Stripe.SubscriptionScheduleUpdateParams.EndBehavior;
	nowMs: number;
}) => {
	if (schedule.end_behavior !== endBehavior) return false;
	const openPhases = schedule.phases.filter(
		(phase) => !phase.end_date || secondsToMilliseconds(phase.end_date) > nowMs,
	);
	if (openPhases.length !== phases.length) return false;

	return phases.every((phase, index) => {
		const openPhase = openPhases[index];
		if (!openPhase) return false;
		// The current phase's start is fixed by Stripe; only future starts can move.
		const sameStart = index === 0 || openPhase.start_date === phase.start_date;
		return (
			sameStart &&
			schedulePhaseItemShape(openPhase) ===
				schedulePhaseItemShape({ items: phase.items ?? [] })
		);
	});
};
