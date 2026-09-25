import type { FullCusProduct } from "@autumn/shared";

/** Autumn's rows for a Stripe schedule that Stripe no longer runs as imported. */
export type SchedulePhaseRows = {
	/** Scheduled rows created for the schedule's future phases. */
	scheduledRows: FullCusProduct[];
	/** Live rows whose end date is one of the schedule's phase boundaries. */
	phaseEndRows: FullCusProduct[];
};
