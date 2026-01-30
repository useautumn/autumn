import { differenceInDays } from "date-fns";
import type Stripe from "stripe";

const phaseAndUnixMatch = ({
	phase,
	unix,
}: {
	phase: Stripe.SubscriptionSchedule.Phase;
	unix: number; // in seconds
}) => {
	const startDateSec = phase.start_date; // seconds
	// Convert seconds to milliseconds for date-fns and compare absolute difference within 1 day
	return (
		Math.abs(differenceInDays(unix * 1000, (startDateSec || 0) * 1000)) <= 1
	);
};

// Helper: build phases by inserting or replacing at the target index
export const preparePhasesForBillingPeriod = ({
	schedule,
	phaseIndex,
	billingPeriodEnd,
}: {
	schedule: Stripe.SubscriptionSchedule;
	phaseIndex: number;
	billingPeriodEnd: number;
}): {
	phases: Stripe.SubscriptionScheduleUpdateParams.Phase[];
	insertIndex: number;
	shouldInsert: boolean;
	originalIndexFor: (i: number) => number;
} => {
	const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] =
		schedule.phases.map((phase) => ({
			items: phase.items.map((item) => ({
				price: (item.price as Stripe.Price).id,
				quantity: item.quantity,
			})),
			start_date: phase.start_date,
			end_date: phase.end_date,
			trial_end: phase.trial_end || undefined,
		}));

	const shouldInsert = !phaseAndUnixMatch({
		phase: schedule.phases[phaseIndex],
		unix: billingPeriodEnd,
	});

	const insertIndex = phaseIndex;
	const phaseToCopyIndex = Math.max(0, insertIndex - 1);

	if (shouldInsert) {
		const copiedPhase = structuredClone(phases[phaseToCopyIndex]);
		copiedPhase.start_date = billingPeriodEnd;
		const nextPhaseOriginalStart = phases[insertIndex]?.start_date;
		if (typeof nextPhaseOriginalStart === "number") {
			copiedPhase.end_date = nextPhaseOriginalStart;
		}
		phases.splice(insertIndex, 0, copiedPhase);
		if (insertIndex - 1 >= 0) {
			phases[insertIndex - 1].end_date = billingPeriodEnd;
		}
	}

	const originalIndexFor = (i: number) => {
		if (shouldInsert) {
			if (i === insertIndex) return phaseToCopyIndex;
			return Math.min(i - 1, schedule.phases.length - 1);
		}
		return Math.min(i, schedule.phases.length - 1);
	};

	return { phases, insertIndex, shouldInsert, originalIndexFor };
};
