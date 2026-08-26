import type { ApiPlanV1 } from "@autumn/shared";

/**
 * Which `?version` the editor should land on after a save. A minted row is not
 * active unless it was promoted, so an unpinned URL would resolve to the old row.
 */
export const savedVersionPin = ({
	plans,
	planId,
}: {
	plans: ApiPlanV1[];
	planId: string;
}): number | null => {
	const saved = plans.find((plan) => plan.id === planId);
	if (!saved || saved.active) return null;
	return saved.version;
};
