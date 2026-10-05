import { secondsToMilliseconds } from "date-fns";
import type Stripe from "stripe";
import { schedulePhaseItemShape } from "@/external/stripe/subscriptionSchedules/utils/schedulePhaseItemShape";

const STRIPE_DEFAULT_PHASE_PRORATION_BEHAVIOR = "create_prorations";

const phaseEndSeconds = (endDate: unknown) =>
	typeof endDate === "number" ? endDate : null;

/** The current phase has already started, so only a later phase's proration still bills anything. */
const sameStartProration = ({
	index,
	openPhase,
	phase,
}: {
	index: number;
	openPhase: Stripe.SubscriptionSchedule.Phase;
	phase: Stripe.SubscriptionScheduleUpdateParams.Phase;
}) =>
	index === 0 ||
	openPhase.proration_behavior ===
		(phase.proration_behavior ?? STRIPE_DEFAULT_PHASE_PRORATION_BEHAVIOR);

/** The live schedule already runs these phases: same current and future phases, start dates, items, proration, end date and end behavior. */
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
	// A released schedule's last phase has a Stripe-derived end; only a cancel end is ours.
	const endsWhereRequested =
		endBehavior !== "cancel" ||
		phaseEndSeconds(openPhases.at(-1)?.end_date) ===
			phaseEndSeconds(phases.at(-1)?.end_date);
	if (!endsWhereRequested) return false;

	// Once a schedule starts, Stripe fixes its current phase's start; before that, it can still move.
	const firstStartIsFixed = schedule.status === "active";

	return phases.every((phase, index) => {
		const openPhase = openPhases[index];
		if (!openPhase) return false;
		const sameStart =
			(index === 0 && firstStartIsFixed) ||
			openPhase.start_date === phase.start_date;
		return (
			sameStart &&
			sameStartProration({ index, openPhase, phase }) &&
			schedulePhaseItemShape(openPhase) ===
				schedulePhaseItemShape({ items: phase.items ?? [] })
		);
	});
};
