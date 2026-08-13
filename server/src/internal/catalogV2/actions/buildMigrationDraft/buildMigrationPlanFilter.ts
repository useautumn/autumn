import type { PlanFilter } from "@autumn/shared";
import type { MigrationTarget } from "./types";

const versionMatcher = ({
	versions,
}: {
	versions: number[];
}): NonNullable<PlanFilter["version"]> => {
	const unique = [...new Set(versions)].sort((a, b) => a - b);
	return unique.length === 1 ? unique[0] : { $in: unique };
};

const coversAllCustomerVersions = ({
	planId,
	versions,
	versionsWithCustomersByPlanId,
}: {
	planId: string;
	versions: number[];
	versionsWithCustomersByPlanId: Record<string, number[]>;
}): boolean => {
	const targeted = [...new Set(versions)];
	// A single-version existing update must stay pinned — collapsing would
	// match later-created sibling versions the caller never targeted.
	if (targeted.length <= 1) return false;
	const customerVersions = versionsWithCustomersByPlanId[planId] ?? [];
	if (customerVersions.length === 0) return false;
	const targetedSet = new Set(targeted);
	return customerVersions.every((version) => targetedSet.has(version));
};

const planBranch = ({
	planId,
	versions,
	versionsWithCustomersByPlanId,
}: {
	planId: string;
	versions: number[];
	versionsWithCustomersByPlanId: Record<string, number[]>;
}): PlanFilter => {
	if (
		coversAllCustomerVersions({
			planId,
			versions,
			versionsWithCustomersByPlanId,
		})
	) {
		return { plan_id: planId };
	}
	return { plan_id: planId, version: versionMatcher({ versions }) };
};

const withCustomGuard = ({
	includeCustom,
	planFilter,
}: {
	includeCustom: boolean;
	planFilter: PlanFilter;
}): PlanFilter => (includeCustom ? planFilter : { ...planFilter, custom: false });

/** Targets → PlanFilter: one branch per plan, version `$in` within a plan, `$or` across plans. */
export const buildMigrationPlanFilter = ({
	targets,
	includeCustom,
	versionsWithCustomersByPlanId,
}: {
	targets: Pick<MigrationTarget, "planId" | "version">[];
	includeCustom: boolean;
	versionsWithCustomersByPlanId: Record<string, number[]>;
}): PlanFilter => {
	const versionsByPlanId = new Map<string, number[]>();
	for (const target of targets) {
		const versions = versionsByPlanId.get(target.planId) ?? [];
		versions.push(target.version);
		versionsByPlanId.set(target.planId, versions);
	}

	const branches = [...versionsByPlanId.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([planId, versions]) =>
			planBranch({ planId, versions, versionsWithCustomersByPlanId }),
		);

	const planFilter: PlanFilter =
		branches.length === 1 ? branches[0]! : { $or: branches };

	return withCustomGuard({ includeCustom, planFilter });
};
