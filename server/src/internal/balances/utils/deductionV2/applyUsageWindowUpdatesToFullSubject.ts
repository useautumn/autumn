import type { FullSubject, UsageWindow } from "@autumn/shared";

/**
 * Refresh the in-flight subject's customer-scoped usage-window counters from
 * the deduction result, so usage_limit_used (webhooks, API responses built
 * from this subject) reflects the deduction. Sibling of
 * applyDeductionUpdateToFullSubject / applyRolloverUpdatesToFullSubject.
 *
 * The Lua result carries ALL scopes. An entity subject keeps its own rows
 * plus the customer-scope rows, which back caps it inherits from the customer.
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
		.filter(
			(usageWindow) =>
				usageWindow.internal_entity_id == null ||
				usageWindow.internal_entity_id === fullSubject.internalEntityId,
		);

	fullSubject.usage_windows = [
		...(fullSubject.usage_windows ?? []).filter(
			(usageWindow) => !updatedFeatureIds.has(usageWindow.feature_id),
		),
		...updatedWindows,
	];
};
