import type { CatalogMigrationPlan } from "@autumn/shared";
import type { MigrationTarget } from "./types";

/** Group targets into `{ plan_id, versions }` — one entry per plan, versions sorted. */
export const targetsToPlans = ({
	targets,
}: {
	targets: MigrationTarget[];
}): CatalogMigrationPlan[] => {
	const versionsByPlanId = new Map<string, Set<number>>();
	for (const target of targets) {
		const versions = versionsByPlanId.get(target.planId) ?? new Set();
		versions.add(target.version);
		versionsByPlanId.set(target.planId, versions);
	}

	return [...versionsByPlanId.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([planId, versions]) => ({
			plan_id: planId,
			versions: [...versions].sort((a, b) => a - b),
		}));
};
