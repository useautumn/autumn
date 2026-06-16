import type { DbOverageAllowed } from "@autumn/shared";

/** Feature ids with native pay-per-use usage_allowed; an overage override must not double-apply to these. */
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

/** Applies an org's overage override: enabled grants overage (unless native pay-per-use), disabled revokes it. */
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
