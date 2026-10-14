import {
	makePlanKey,
	normalizePlanKeys,
	parsePlanKey,
} from "@/lib/planSelectionKeys";

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
	return [...keys.filter((existing) => existing !== planId), key];
};

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
