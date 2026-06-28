import type {
	ApiPlanItemV1,
	ApiPlanV1,
	DiffedCustomizePlanV1,
	Feature,
	PlanItemFilter,
	PlanUpdatePreviewVariantConflict,
} from "@autumn/shared";

const intervalOf = (item: ApiPlanItemV1): string =>
	item.price?.interval ?? item.reset?.interval ?? "none";

const groupByFeature = (
	items: ApiPlanItemV1[],
): Map<string, ApiPlanItemV1[]> => {
	const map = new Map<string, ApiPlanItemV1[]>();
	for (const item of items) {
		const list = map.get(item.feature_id) ?? [];
		list.push(item);
		map.set(item.feature_id, list);
	}
	return map;
};

const filterForItem = (item: ApiPlanItemV1): PlanItemFilter => {
	const filter: PlanItemFilter = { feature_id: item.feature_id };
	if (item.price?.billing_method)
		filter.billing_method = item.price.billing_method;
	const interval = item.price?.interval ?? item.reset?.interval;
	if (interval) filter.interval = interval as PlanItemFilter["interval"];
	const intervalCount =
		item.price?.interval_count ?? item.reset?.interval_count;
	if (intervalCount) filter.interval_count = intervalCount;
	return filter;
};

/**
 * A feature is conflicting when the base edit changed it but the variant holds
 * it only at intervals the edited plan doesn't touch — propagating would insert
 * a spurious item, so the owner should handle that variant separately.
 */
export const detectVariantConflicts = ({
	editedBasePlan,
	diff,
	variantPlan,
	features,
}: {
	editedBasePlan: ApiPlanV1;
	diff: DiffedCustomizePlanV1;
	variantPlan: ApiPlanV1;
	features: Feature[];
}): PlanUpdatePreviewVariantConflict[] => {
	const changedFeatureIds = new Set<string>([
		...(diff.add_items ?? []).map((i) => i.feature_id),
		...(diff.remove_items ?? [])
			.map((i) => i.feature_id)
			.filter((id): id is string => id !== undefined),
	]);

	const editedByFeature = groupByFeature(editedBasePlan.items);
	const variantByFeature = groupByFeature(variantPlan.items);

	const conflicts: PlanUpdatePreviewVariantConflict[] = [];
	for (const featureId of changedFeatureIds) {
		// Feature removed from the base entirely — propagating the removal is
		// clean, so it's never a conflict.
		const editedList = editedByFeature.get(featureId) ?? [];
		if (editedList.length === 0) continue;

		const variantList = variantByFeature.get(featureId) ?? [];
		if (variantList.length === 0) continue; // clean add into variant

		const editedIntervals = new Set(editedList.map(intervalOf));
		const variantIntervals = new Set(variantList.map(intervalOf));
		const sharesInterval = [...variantIntervals].some((iv) =>
			editedIntervals.has(iv),
		);
		if (sharesInterval) continue;

		conflicts.push({
			item_filter: filterForItem(variantList[0]),
			feature_name: features.find((f) => f.id === featureId)?.name,
			reason: "different_interval",
		});
	}

	return conflicts;
};
