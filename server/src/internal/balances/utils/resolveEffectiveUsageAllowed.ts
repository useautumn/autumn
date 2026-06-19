import type { DbOverageAllowed } from "@autumn/shared";

export const getNativeUsageAllowedFeatureIds = (
	cusEnts: Array<{
		usage_allowed?: boolean | null;
		entitlement: { feature: { id: string } };
	}>,
): Set<string> =>
	new Set(
		cusEnts
			.filter((cusEnt) => cusEnt.usage_allowed)
			.map((cusEnt) => cusEnt.entitlement.feature.id),
	);

export const resolveEffectiveUsageAllowed = ({
	baseUsageAllowed,
	featureId,
	overageAllowedByFeatureId,
	nativeUsageAllowedFeatureIds,
}: {
	baseUsageAllowed: boolean;
	featureId: string;
	overageAllowedByFeatureId: Record<string, DbOverageAllowed>;
	nativeUsageAllowedFeatureIds: Set<string>;
}): boolean => {
	const overageAllowedControl = overageAllowedByFeatureId[featureId];

	if (
		overageAllowedControl?.enabled === true &&
		!nativeUsageAllowedFeatureIds.has(featureId)
	) {
		return true;
	}

	if (overageAllowedControl?.enabled === false) {
		return false;
	}

	return baseUsageAllowed;
};
