import type Stripe from "stripe";

// Stripe stores phase starts at second precision; Autumn stores ms. Ignore
export const STRIPE_SECOND_PRECISION_MS = 1000;

export type SchedulePhaseMove = { oldStartMs: number; newStartMs: number };

export const getSchedulePhaseMoves = ({
	previousPhases,
	currentPhases,
}: {
	previousPhases: Stripe.SubscriptionSchedule.Phase[];
	currentPhases: Stripe.SubscriptionSchedule.Phase[];
}): SchedulePhaseMove[] => {
	const moves: SchedulePhaseMove[] = [];
	for (const [index, previousPhase] of previousPhases.entries()) {
		const oldStartMs = (previousPhase.start_date ?? 0) * 1000;
		const newStartMs = (currentPhases[index]?.start_date ?? 0) * 1000;
		if (!(oldStartMs && newStartMs)) continue;
		if (Math.abs(oldStartMs - newStartMs) < STRIPE_SECOND_PRECISION_MS)
			continue;
		moves.push({ oldStartMs, newStartMs });
	}
	return moves;
};
