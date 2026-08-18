import {
	makePlanKey,
	normalizePlanKeys,
	parsePlanKey,
} from "@/lib/planSelectionKeys";

/**
 * A plan's scope within a selection: every version (the whole-plan key), a set
 * of pinned versions, or nothing. Whole-plan and pinned picks never coexist.
 */
export const planScopeIsWholePlan = ({
	selectedKeys,
	planId,
}: {
	selectedKeys: string[];
	planId: string;
}): boolean => selectedKeys.includes(planId);

export const planScopeIncludesVersion = ({
	selectedKeys,
	planId,
	version,
}: {
	selectedKeys: string[];
	planId: string;
	version: number;
}): boolean => selectedKeys.includes(makePlanKey({ planId, version }));

export const planScopePinnedVersions = ({
	selectedKeys,
	planId,
}: {
	selectedKeys: string[];
	planId: string;
}): number[] =>
	selectedKeys
		.map(parsePlanKey)
		.filter(
			(selection) =>
				selection.planId === planId && selection.version !== undefined,
		)
		.map((selection) => selection.version as number)
		.sort((left, right) => left - right);

export const toggleWholePlan = ({
	selectedKeys,
	planId,
}: {
	selectedKeys: string[];
	planId: string;
}): string[] => {
	const keys = normalizePlanKeys(selectedKeys);
	if (planScopeIsWholePlan({ selectedKeys: keys, planId })) {
		return keys.filter((key) => key !== planId);
	}
	// Whole plan supersedes any pinned versions of the same plan.
	return [...keys.filter((key) => parsePlanKey(key).planId !== planId), planId];
};

export const togglePlanVersion = ({
	selectedKeys,
	planId,
	version,
}: {
	selectedKeys: string[];
	planId: string;
	version: number;
}): string[] => {
	const keys = normalizePlanKeys(selectedKeys);
	const key = makePlanKey({ planId, version });
	if (keys.includes(key)) return keys.filter((existing) => existing !== key);
	// A specific version supersedes the whole-plan pick.
	return [...keys.filter((existing) => existing !== planId), key];
};

/** Trailing summary for a plan row: "All versions", "v1, v2", or "None". */
export const planScopeLabel = ({
	selectedKeys,
	planId,
}: {
	selectedKeys: string[];
	planId: string;
}): string => {
	if (planScopeIsWholePlan({ selectedKeys, planId })) return "All versions";
	const versions = planScopePinnedVersions({ selectedKeys, planId });
	if (versions.length === 0) return "None";
	return versions.map((version) => `v${version}`).join(", ");
};

/**
 * Collapse a plan whose every version is pinned down to the whole-plan key, so
 * the row reads "All versions" rather than enumerating them.
 */
export const collapseFullyPinnedPlan = ({
	selectedKeys,
	planId,
	versions,
}: {
	selectedKeys: string[];
	planId: string;
	versions: number[];
}): string[] => {
	if (versions.length === 0) return selectedKeys;
	const pinned = planScopePinnedVersions({ selectedKeys, planId });
	if (pinned.length !== versions.length) return selectedKeys;
	return toggleWholePlan({ selectedKeys, planId });
};
