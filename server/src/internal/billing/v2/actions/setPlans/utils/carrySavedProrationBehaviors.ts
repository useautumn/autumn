import type { SchedulePhasePlan } from "../types/schedulePhasePlan";

/** A phase that names no proration keeps the one its saved phase at the same start holds. */
export const carrySavedProrationBehaviors = ({
	phases,
	savedPhases,
}: {
	phases: SchedulePhasePlan[];
	savedPhases: SchedulePhasePlan[];
}): SchedulePhasePlan[] =>
	phases.map((phase) => ({
		...phase,
		prorationBehavior:
			phase.prorationBehavior !== undefined
				? phase.prorationBehavior
				: (savedPhases.find(({ startsAt }) => startsAt === phase.startsAt)
						?.prorationBehavior ?? null),
	}));
