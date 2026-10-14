import type { FullSubject, UsageWindow } from "@autumn/shared";

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
