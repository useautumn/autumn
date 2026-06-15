import type { BasePriceParams } from "@api/products/components/basePrice/basePrice.js";
import {
	type ApiPlanV1,
	type CreatePlanItemParamsV1,
	CustomizePlanV1Schema,
	type PlanItemFilter,
} from "@autumn/shared";
import type { z } from "zod/v4";

export const DiffedCustomizePlanV1Schema = CustomizePlanV1Schema.omit({
	items: true,
});

export type DiffedCustomizePlanV1 = z.infer<typeof DiffedCustomizePlanV1Schema>;

type ApiPlanItem = ApiPlanV1["items"][number];

const toBasePriceParams = (
	price: NonNullable<ApiPlanV1["price"]>,
): BasePriceParams => ({
	amount: price.amount,
	interval: price.interval,
	...(price.interval_count !== undefined
		? { interval_count: price.interval_count }
		: {}),
});

const toCreatePlanItemParams = (item: ApiPlanItem): CreatePlanItemParamsV1 => {
	const out: CreatePlanItemParamsV1 = { feature_id: item.feature_id };
	if (item.included !== undefined && item.included !== null)
		out.included = item.included;
	if (item.unlimited !== undefined && item.unlimited !== null)
		out.unlimited = item.unlimited;
	if (item.reset) out.reset = item.reset;
	if (item.price) out.price = item.price as CreatePlanItemParamsV1["price"];
	if (item.rollover) {
		out.rollover = {
			expiry_duration_type: item.rollover.expiry_duration_type,
			...(item.rollover.max != null ? { max: item.rollover.max } : {}),
			...(item.rollover.max_percentage != null
				? { max_percentage: item.rollover.max_percentage }
				: {}),
			...(item.rollover.expiry_duration_length !== undefined
				? { expiry_duration_length: item.rollover.expiry_duration_length }
				: {}),
		};
	}
	return out;
};

const composeMatchKey = (item: ApiPlanItem): string => {
	const billingMethod = item.price?.billing_method ?? "";
	const interval = item.price?.interval ?? item.reset?.interval ?? "";
	const intervalCount =
		item.price?.interval_count ?? item.reset?.interval_count ?? "";
	return `${item.feature_id}|${billingMethod}|${interval}|${intervalCount}`;
};

const buildRemoveFilter = (item: ApiPlanItem): PlanItemFilter => {
	const filter: PlanItemFilter = { feature_id: item.feature_id };
	if (item.price?.billing_method !== undefined)
		filter.billing_method = item.price.billing_method;
	const interval = item.price?.interval ?? item.reset?.interval;
	if (interval !== undefined)
		filter.interval = interval as PlanItemFilter["interval"];
	const intervalCount =
		item.price?.interval_count ?? item.reset?.interval_count;
	if (intervalCount !== undefined) filter.interval_count = intervalCount;
	return filter;
};

const pricesEqual = (a: ApiPlanV1["price"], b: ApiPlanV1["price"]): boolean => {
	if (a === null && b === null) return true;
	if (a === null || b === null) return false;
	return (
		a.amount === b.amount &&
		a.interval === b.interval &&
		(a.interval_count ?? 1) === (b.interval_count ?? 1)
	);
};

const freeTrialsEqual = (
	a: ApiPlanV1["free_trial"],
	b: ApiPlanV1["free_trial"],
): boolean => {
	if (a == null && b == null) return true;
	if (a == null || b == null) return false;
	return JSON.stringify(a) === JSON.stringify(b);
};

// Equality ignores `display` (UI-derived) and `feature` (join, not user input).
const itemsEqual = (a: ApiPlanItem, b: ApiPlanItem): boolean => {
	const strip = ({ display: _d, feature: _f, ...rest }: ApiPlanItem) => rest;
	return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
};

// Modify-in-place is expressed as remove + add ("out with the old, in with the new").
export const diffPlanV1 = ({
	from,
	to,
}: {
	from: ApiPlanV1;
	to: ApiPlanV1;
}): DiffedCustomizePlanV1 => {
	const diff: DiffedCustomizePlanV1 = {};

	if (!pricesEqual(from.price, to.price)) {
		diff.price = to.price === null ? null : toBasePriceParams(to.price);
	}

	const fromByKey = new Map(from.items.map((i) => [composeMatchKey(i), i]));
	const toByKey = new Map(to.items.map((i) => [composeMatchKey(i), i]));

	const addItems: CreatePlanItemParamsV1[] = [];
	for (const toItem of to.items) {
		const fromItem = fromByKey.get(composeMatchKey(toItem));
		if (!fromItem || !itemsEqual(fromItem, toItem)) {
			addItems.push(toCreatePlanItemParams(toItem));
		}
	}
	if (addItems.length > 0) diff.add_items = addItems;

	const removeItems: PlanItemFilter[] = [];
	for (const fromItem of from.items) {
		const toItem = toByKey.get(composeMatchKey(fromItem));
		if (!toItem || !itemsEqual(fromItem, toItem)) {
			removeItems.push(buildRemoveFilter(fromItem));
		}
	}
	if (removeItems.length > 0) diff.remove_items = removeItems;

	if (!freeTrialsEqual(from.free_trial, to.free_trial)) {
		if (to.free_trial == null) {
			diff.free_trial = null;
		} else {
			const { on_end, ...rest } = to.free_trial;
			diff.free_trial = on_end == null ? rest : { ...rest, on_end };
		}
	}

	return diff;
};
