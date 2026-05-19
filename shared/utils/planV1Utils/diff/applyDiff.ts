import type {
	ApiPlanV1,
	CreatePlanItemParamsV1,
	PlanItemFilter,
} from "@autumn/shared";
import type { DiffedCustomizePlanV1 } from "./diffPlanV1.js";

export type ApplyDiffOutput = {
	price: ApiPlanV1["price"];
	items: ApiPlanV1["items"];
	free_trial: ApiPlanV1["free_trial"];
};

type ApiPlanItem = ApiPlanV1["items"][number];

const applyPrice = (
	base: ApiPlanV1["price"],
	diff: DiffedCustomizePlanV1["price"],
): ApiPlanV1["price"] => {
	if (diff === undefined) return base;
	if (diff === null) return null;
	return { ...diff };
};

const itemMatchesFilter = (
	item: ApiPlanItem,
	filter: PlanItemFilter,
): boolean => {
	if (filter.feature_id !== undefined && item.feature_id !== filter.feature_id)
		return false;
	if (filter.billing_method !== undefined) {
		if (item.price?.billing_method !== filter.billing_method)
			return false;
	} else if (item.price?.billing_method !== undefined) {
		// Filter built from a price-null item must not match priced candidates.
		return false;
	}
	if (filter.interval !== undefined) {
		const itemInterval = item.price?.interval ?? item.reset?.interval;
		if (String(itemInterval) !== String(filter.interval)) return false;
	}
	if (filter.interval_count !== undefined) {
		const itemCount =
			item.price?.interval_count ?? item.reset?.interval_count;
		if ((itemCount ?? 1) !== filter.interval_count) return false;
	}
	return true;
};

const removeItems = (
	items: ApiPlanV1["items"],
	removeFilters: PlanItemFilter[],
): ApiPlanV1["items"] => {
	return items.filter(
		(item) => !removeFilters.some((filter) => itemMatchesFilter(item, filter)),
	);
};

const toApiPlanItem = (params: CreatePlanItemParamsV1): ApiPlanItem => {
	// v0.0.0: create-shape is a semantic subset of ApiPlanItemV1.
	// Missing optional fields (display, feature, rollover, etc.) stay undefined.
	return { ...params } as ApiPlanItem;
};

const applyItems = (
	baseItems: ApiPlanV1["items"],
	diff: DiffedCustomizePlanV1,
): ApiPlanV1["items"] => {
	let items = [...baseItems];
	if (diff.remove_items) {
		items = removeItems(items, diff.remove_items);
	}
	if (diff.add_items) {
		items = [...items, ...diff.add_items.map(toApiPlanItem)];
	}
	return items;
};

const applyFreeTrial = (
	base: ApiPlanV1["free_trial"],
	diff: DiffedCustomizePlanV1["free_trial"],
): ApiPlanV1["free_trial"] => {
	if (diff === undefined) return base;
	if (diff === null) return undefined;
	return { ...diff } as ApiPlanV1["free_trial"];
};

export const applyDiff = ({
	base,
	diff,
}: {
	base: ApiPlanV1;
	diff: DiffedCustomizePlanV1;
}): ApplyDiffOutput => ({
	price: applyPrice(base.price, diff.price),
	items: applyItems(base.items, diff),
	free_trial: applyFreeTrial(base.free_trial, diff.free_trial),
});
