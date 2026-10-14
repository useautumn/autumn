import type { SchedulePhasePlan } from "../types/schedulePhasePlan";

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
