import type {
	ApiPlanV1,
	CreatePlanItemParamsV1,
	PlanItemFilter,
} from "@autumn/shared";
import { composeMatchKey, type DiffedCustomizePlanV1 } from "./diffPlanV1.js";

export type ApplyDiffOutput = {
	price: ApiPlanV1["price"];
	items: ApiPlanV1["items"];
	free_trial: ApiPlanV1["free_trial"];
};

type ApiPlanItem = ApiPlanV1["items"][number];
type ApiPlanItemPrice = NonNullable<ApiPlanItem["price"]>;
type ApiPlanItemRollover = NonNullable<ApiPlanItem["rollover"]>;

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
		if (item.price?.billing_method !== filter.billing_method) return false;
	} else if (item.price?.billing_method !== undefined) {
		return false;
	}
	if (filter.interval !== undefined) {
		const itemInterval = item.price?.interval ?? item.reset?.interval;
		if (String(itemInterval) !== String(filter.interval)) return false;
	}
	if (filter.interval_count !== undefined) {
		const itemCount = item.price?.interval_count ?? item.reset?.interval_count;
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

const toApiPlanItemPrice = (
	price: CreatePlanItemParamsV1["price"],
): ApiPlanItemPrice | null => {
	if (!price) return null;

	return {
		...price,
		billing_units: price.billing_units ?? 1,
		max_purchase: price.max_purchase ?? null,
	};
};

const toApiPlanItemRollover = (
	rollover: CreatePlanItemParamsV1["rollover"],
): ApiPlanItemRollover | undefined => {
	if (!rollover) return undefined;

	return {
		...rollover,
		max: rollover.max ?? null,
	};
};

const toApiPlanItem = (params: CreatePlanItemParamsV1): ApiPlanItem => {
	return {
		...params,
		included: params.included ?? 0,
		unlimited: params.unlimited ?? false,
		reset: params.reset ?? null,
		price: toApiPlanItemPrice(params.price),
		rollover: toApiPlanItemRollover(params.rollover),
	} as ApiPlanItem;
};

const isFreeNonResetEntitlement = (
	item: ApiPlanItem | CreatePlanItemParamsV1,
): boolean => item.price == null && item.reset == null;

const applyItems = (
	baseItems: ApiPlanV1["items"],
	diff: DiffedCustomizePlanV1,
): ApiPlanV1["items"] => {
	let items = [...baseItems];
	if (diff.remove_items) {
		items = removeItems(items, diff.remove_items);
	}
	if (diff.add_items) {
		const entitlementKeys = new Set<string>();
		for (const item of items) {
			if (isFreeNonResetEntitlement(item)) {
				entitlementKeys.add(composeMatchKey(item));
			}
		}

		for (const addItem of diff.add_items) {
			const key = composeMatchKey(addItem);
			if (isFreeNonResetEntitlement(addItem) && entitlementKeys.has(key)) {
				continue;
			}

			items.push(toApiPlanItem(addItem));
			if (isFreeNonResetEntitlement(addItem)) {
				entitlementKeys.add(key);
			}
		}
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
