import type { DbOverageAllowed } from "@autumn/shared";

/**
 * Feature ids whose entitlements carry native (pay-per-use) usage_allowed. An
 * `overage_allowed: enabled: true` override must not force usage_allowed onto
 * these — their native overage mechanism already handles it. Built once from a
 * customer's entitlements and fed to resolveEffectiveUsageAllowed.
 */
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
