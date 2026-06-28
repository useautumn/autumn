import {
	type ApiPlanItemV1,
	type ApiPlanV1,
	composeMatchKey,
	type DiffedCustomizePlanV1,
	type Feature,
	type PlanItemFilter,
	type PlanUpdatePreviewVariantConflict,
} from "@autumn/shared";

const intervalOf = (item: ApiPlanItemV1): string =>
	item.price?.interval ?? item.reset?.interval ?? "none";

// Fields that the match key ignores — the customizable "value" of an item.
const valueSignature = (item: ApiPlanItemV1): string =>
	JSON.stringify({
		included: item.included ?? null,
		unlimited: item.unlimited ?? null,
		price: item.price ?? null,
		rollover: item.rollover ?? null,
	});

const basePricesEqual = (
	a: ApiPlanV1["price"],
	b: ApiPlanV1["price"],
): boolean => {
	if (a == null && b == null) return true;
	if (a == null || b == null) return false;
	return (
		a.amount === b.amount &&
		a.interval === b.interval &&
		(a.interval_count ?? 1) === (b.interval_count ?? 1)
	);
};

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
 * Conflicts the variant owner should resolve manually before propagating:
 * - different_interval: variant holds the feature at an interval the edit
 *   doesn't touch — propagation adds a duplicate item.
 * - value_divergence: variant customized the feature's value relative to the
 *   base — propagation would silently overwrite it.
 * - base_price_divergence: variant customized its base price — a base price
 *   edit would overwrite it.
 */
export const detectVariantConflicts = ({
	currentBasePlan,
	editedBasePlan,
	diff,
	variantPlan,
	features,
}: {
	currentBasePlan: ApiPlanV1;
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
	const baseOldByMatchKey = new Map(
		currentBasePlan.items.map((item) => [composeMatchKey(item), item]),
	);

	const featureName = (featureId: string) =>
		features.find((f) => f.id === featureId)?.name;

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

		if (!sharesInterval) {
			conflicts.push({
				item_filter: filterForItem(variantList[0]),
				feature_name: featureName(featureId),
				reason: "different_interval",
			});
			continue;
		}

		// Shares the interval the edit touches: propagation overwrites the
		// variant's item, so flag it if the variant customized the value relative
		// to the base it forked from.
		const divergentItem = variantList.find((item) => {
			if (!editedIntervals.has(intervalOf(item))) return false;
			const baseOld = baseOldByMatchKey.get(composeMatchKey(item));
			return (
				baseOld != null && valueSignature(item) !== valueSignature(baseOld)
			);
		});
		if (divergentItem) {
			conflicts.push({
				item_filter: filterForItem(divergentItem),
				feature_name: featureName(featureId),
				reason: "value_divergence",
			});
		}
	}

	if (
		diff.price !== undefined &&
		!basePricesEqual(variantPlan.price, currentBasePlan.price)
	) {
		conflicts.push({ reason: "base_price_divergence" });
	}

	return conflicts;
};
