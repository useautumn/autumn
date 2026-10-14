import type { PhaseProrationBehavior } from "@autumn/shared";

export type SchedulePhasePlan = {
	startsAt: number;
	customerProductIds: string[];
	prorationBehavior?: PhaseProrationBehavior | null;
};
