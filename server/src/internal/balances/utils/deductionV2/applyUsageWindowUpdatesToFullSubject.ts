import type { FullSubject, UsageWindow } from "@autumn/shared";

/**
 * Refresh the in-flight subject's customer-scoped usage-window counters from
 * the deduction result, so usage_limit_used (webhooks, API responses built
 * from this subject) reflects the deduction. Sibling of
 * applyDeductionUpdateToFullSubject / applyRolloverUpdatesToFullSubject.
 *
 * The Lua result carries ALL scopes; the subject keeps its own scope only
 * (entity subjects hold just their entity's rows).
 */
export const applyUsageWindowUpdatesToFullSubject = ({
	fullSubject,
	usageWindowsByFeatureId,
}: {
	fullSubject: FullSubject;
	usageWindowsByFeatureId: Record<string, UsageWindow[]> | null | undefined;
}): void => {
	if (!usageWindowsByFeatureId) return;

	const updatedFeatureIds = new Set(Object.keys(usageWindowsByFeatureId));
	const updatedWindows = Object.values(usageWindowsByFeatureId)
		.flat()
		.filter((usageWindow) =>
			fullSubject.internalEntityId
				? usageWindow.internal_entity_id === fullSubject.internalEntityId
				: true,
		);

	fullSubject.usage_windows = [
		...(fullSubject.usage_windows ?? []).filter(
			(usageWindow) => !updatedFeatureIds.has(usageWindow.feature_id),
		),
		...updatedWindows,
	];
};
