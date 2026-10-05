import type { PhaseProrationBehavior } from "@autumn/shared";

export type SchedulePhasePlan = {
	startsAt: number;
	customerProductIds: string[];
	/** How Stripe bills the phase's start; undefined keeps what the saved phase holds. */
	prorationBehavior?: PhaseProrationBehavior | null;
};
