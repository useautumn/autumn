import type { FullCusProduct } from "@autumn/shared";

/** The rows Autumn holds for a Stripe schedule that Stripe no longer runs as imported. */
export type HeldSchedulePhases = {
	/** Scheduled rows created for the schedule's future phases. */
	heldRows: FullCusProduct[];
	/** Live rows whose end date is one of the schedule's phase boundaries. */
	phaseEndRows: FullCusProduct[];
};
