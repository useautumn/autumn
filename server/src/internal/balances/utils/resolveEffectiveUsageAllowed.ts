import type { DbOverageAllowed } from "@autumn/shared";

/**
 * Applies an org's overage-allowed override to a feature's base usage-allowed
 * flag. An `enabled: true` override grants overage unless the feature already
 * has native usage_allowed (pay-per-use already handles it); an
 * `enabled: false` override revokes overage outright.
 */
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
