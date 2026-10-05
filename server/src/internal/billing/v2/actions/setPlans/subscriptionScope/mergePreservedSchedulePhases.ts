import type { SchedulePhasePlan } from "../types/schedulePhasePlan";

type SchedulePhase = SchedulePhasePlan;

const customerProductIdsAt = ({
	phases,
	startsAt,
}: {
	phases: SchedulePhase[];
	startsAt: number;
}) =>
	phases.filter((phase) => phase.startsAt <= startsAt).at(-1)
		?.customerProductIds ?? [];

const sortByStart = (phases: SchedulePhase[]) =>
	[...phases].sort((first, second) => first.startsAt - second.startsAt);

/** Folds the old schedule's out-of-scope plans into the new phases, so a
 * request scoped to one subscription never drops another's schedule. */
export const mergePreservedSchedulePhases = ({
	phases,
	existingPhases,
	preservedCustomerProductIds,
}: {
	phases: SchedulePhase[];
	existingPhases: SchedulePhase[];
	preservedCustomerProductIds: Set<string>;
}): SchedulePhase[] => {
	const preservedPhases = sortByStart(
		existingPhases.map(({ startsAt, customerProductIds }) => ({
			startsAt,
			customerProductIds: customerProductIds.filter((id) =>
				preservedCustomerProductIds.has(id),
			),
		})),
	);
	const hasPreservedProducts = preservedPhases.some(
		({ customerProductIds }) => customerProductIds.length > 0,
	);
	const sortedPhases = sortByStart(phases);
	const [firstPhase] = sortedPhases;
	if (!hasPreservedProducts || !firstPhase) return phases;

	const phaseStarts = [
		...new Set([
			...sortedPhases.map(({ startsAt }) => startsAt),
			...preservedPhases
				.map(({ startsAt }) => startsAt)
				.filter((startsAt) => startsAt > firstPhase.startsAt),
		]),
	].sort((first, second) => first - second);

	return phaseStarts.map((startsAt) => ({
		startsAt,
		prorationBehavior: sortedPhases.find((phase) => phase.startsAt === startsAt)
			?.prorationBehavior,
		customerProductIds: [
			...new Set([
				...customerProductIdsAt({ phases: sortedPhases, startsAt }),
				...customerProductIdsAt({ phases: preservedPhases, startsAt }),
			]),
		],
	}));
};
