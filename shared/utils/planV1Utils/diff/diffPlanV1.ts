import type { BasePriceParams } from "@api/products/components/basePrice/basePrice.js";
import {
	type ApiPlanV1,
	type CreatePlanItemParamsV1,
	CustomizePlanV1BaseSchema,
	type PlanItemFilter,
	refineCustomizePlanV1Schema,
} from "@autumn/shared";
import { FreeTrialDuration } from "@models/productModels/freeTrialModels/freeTrialEnums.js";
import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import type { z } from "zod/v4";

export const DiffedCustomizePlanV1Schema = refineCustomizePlanV1Schema(
	CustomizePlanV1BaseSchema.omit({
		items: true,
		upsert_licenses: true,
	}).strict(),
	{ includeItems: false, includeLicenses: false },
);

export type DiffedCustomizePlanV1 = z.infer<typeof DiffedCustomizePlanV1Schema>;

type ApiPlanItem = ApiPlanV1["items"][number];
type PlanItemInput = ApiPlanItem | CreatePlanItemParamsV1;
type PlanItemPrice = NonNullable<PlanItemInput["price"]>;
type PlanItemRollover = NonNullable<PlanItemInput["rollover"]>;
type PlanItemProration = NonNullable<PlanItemInput["proration"]>;
type AdditionalCurrencyInput = {
	currency: string;
	amount?: number | null;
	flat_amount?: number | null;
};

type BasePriceInput = {
	amount: number;
	interval?: string | null;
	interval_count?: number | null;
	additional_currencies?: AdditionalCurrencyInput[] | null;
};

// Adding or removing a catalog currency doesn't change what existing
// customers pay (their prices are snapshots), so neither forces a version or
// migration; only changed amounts for a currency present on both sides do.
const additionalCurrenciesCompatible = (
	from: AdditionalCurrencyInput[] | null | undefined,
	to: AdditionalCurrencyInput[] | null | undefined,
): boolean =>
	(from ?? []).every((entry) => {
		const match = (to ?? []).find(
			(other) => other.currency.toLowerCase() === entry.currency.toLowerCase(),
		);
		return (
			!match ||
			((entry.amount ?? null) === (match.amount ?? null) &&
				(entry.flat_amount ?? null) === (match.flat_amount ?? null))
		);
	});

export const toBasePriceParams = (
	price: NonNullable<ApiPlanV1["price"]>,
): BasePriceParams => ({
	amount: price.amount,
	interval: price.interval,
	...(price.interval_count !== undefined
		? { interval_count: price.interval_count }
		: {}),
	...(price.additional_currencies?.length
		? { additional_currencies: price.additional_currencies }
		: {}),
});

export const toCreatePlanItemParams = (
	item: ApiPlanItem,
): CreatePlanItemParamsV1 => {
	const out: CreatePlanItemParamsV1 = { feature_id: item.feature_id };
	if (item.entity_feature_id !== undefined)
		out.entity_feature_id = item.entity_feature_id;
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
	if (item.proration?.on_increase && item.proration.on_decrease) {
		out.proration = {
			on_increase: item.proration.on_increase,
			on_decrease: item.proration.on_decrease,
		};
	}
	return out;
};

/** Structural minimum for keying an item — satisfied by both ApiPlanItemV1
 * (resolved plan) and CreatePlanItemParamsV1 (diff add_items). */
type MatchKeyItem = {
	feature_id: string;
	price?: {
		billing_method?: string | null;
		interval?: string | null;
		interval_count?: number | null;
	} | null;
	reset?: { interval?: string | null; interval_count?: number | null } | null;
};

/** The identity an item is matched on across from/to (and against remove
 * filters): feature + billing method + interval + interval count. */
export const composeMatchKey = (item: MatchKeyItem): string => {
	const billingMethod = item.price?.billing_method ?? "";
	const interval = item.price?.interval ?? item.reset?.interval ?? "";
	const intervalCount = normalizeIntervalCount({
		interval,
		intervalCount: item.price?.interval_count ?? item.reset?.interval_count,
	});
	return `${item.feature_id}|${billingMethod}|${interval}|${intervalCount}`;
};

/** Match key for a remove_items filter, in the same format as composeMatchKey
 * (buildRemoveFilter already flattens the matched item's fields onto it). */
export const planItemFilterMatchKey = (filter: PlanItemFilter): string =>
	`${filter.feature_id}|${filter.billing_method ?? ""}|${filter.interval ?? ""}|${normalizeIntervalCount(
		{
			interval: filter.interval,
			intervalCount: filter.interval_count,
		},
	)}`;

const normalizeIntervalCount = ({
	interval,
	intervalCount,
}: {
	interval?: string | null;
	intervalCount?: number | null;
}): number | "" => (interval ? (intervalCount ?? 1) : (intervalCount ?? ""));

const buildRemoveFilter = (item: ApiPlanItem): PlanItemFilter => {
	const filter: PlanItemFilter = { feature_id: item.feature_id };
	if (item.price?.billing_method !== undefined)
		filter.billing_method = item.price.billing_method;
	const interval = item.price?.interval ?? item.reset?.interval;
	if (interval !== undefined)
		filter.interval = interval as PlanItemFilter["interval"];
	const intervalCount =
		item.price?.interval_count ?? item.reset?.interval_count;
	if (interval !== undefined) filter.interval_count = intervalCount ?? 1;
	return filter;
};

const pricesEqual = (
	a: BasePriceInput | null | undefined,
	b: BasePriceInput | null | undefined,
): boolean => {
	if (a === undefined && b === undefined) return true;
	if (a === null && b === null) return true;
	if (a == null || b == null) return false;
	return (
		a.amount === b.amount &&
		a.interval === b.interval &&
		(a.interval_count ?? 1) === (b.interval_count ?? 1) &&
		additionalCurrenciesCompatible(
			a.additional_currencies,
			b.additional_currencies,
		)
	);
};

const freeTrialsEqual = (
	a: DiffedCustomizePlanV1["free_trial"] | ApiPlanV1["free_trial"],
	b: DiffedCustomizePlanV1["free_trial"] | ApiPlanV1["free_trial"],
): boolean => {
	if (a === undefined && b === undefined) return true;
	if (a === null && b === null) return true;
	if (a == null || b == null) return false;
	return (
		a.duration_length === b.duration_length &&
		(a.duration_type ?? FreeTrialDuration.Month) ===
			(b.duration_type ?? FreeTrialDuration.Month) &&
		(a.card_required ?? true) === (b.card_required ?? true) &&
		(a.on_end ?? "bill") === (b.on_end ?? "bill")
	);
};

const tiersEqual = (
	a: NonNullable<PlanItemPrice["tiers"]> | undefined,
	b: NonNullable<PlanItemPrice["tiers"]> | undefined,
): boolean => {
	if (!a?.length && !b?.length) return true;
	if (!a || !b || a.length !== b.length) return false;

	return a.every((tier, index) => {
		const other = b[index];
		return (
			tier.to === other.to &&
			(tier.amount ?? 0) === (other.amount ?? 0) &&
			(tier.flat_amount ?? null) === (other.flat_amount ?? null) &&
			additionalCurrenciesCompatible(
				tier.additional_currencies,
				other.additional_currencies,
			)
		);
	});
};

const itemPricesEqual = (
	a: PlanItemPrice | null | undefined,
	b: PlanItemPrice | null | undefined,
): boolean => {
	if (a == null && b == null) return true;
	if (a == null || b == null) return false;
	const aTierBehavior = a.tiers?.length
		? (a.tier_behavior ?? TierBehavior.Graduated)
		: null;
	const bTierBehavior = b.tiers?.length
		? (b.tier_behavior ?? TierBehavior.Graduated)
		: null;

	return (
		(a.amount ?? null) === (b.amount ?? null) &&
		additionalCurrenciesCompatible(
			a.additional_currencies,
			b.additional_currencies,
		) &&
		tiersEqual(a.tiers, b.tiers) &&
		aTierBehavior === bTierBehavior &&
		a.interval === b.interval &&
		(a.interval_count ?? 1) === (b.interval_count ?? 1) &&
		(a.billing_units ?? 1) === (b.billing_units ?? 1) &&
		a.billing_method === b.billing_method &&
		(a.max_purchase ?? null) === (b.max_purchase ?? null)
	);
};

const prorationsEqual = (
	a: PlanItemProration | null | undefined,
	b: PlanItemProration | null | undefined,
): boolean => {
	if (a == null && b == null) return true;
	if (a == null || b == null) return false;
	return (
		(a.on_increase ?? null) === (b.on_increase ?? null) &&
		(a.on_decrease ?? null) === (b.on_decrease ?? null)
	);
};

const rolloversEqual = (
	a: PlanItemRollover | null | undefined,
	b: PlanItemRollover | null | undefined,
): boolean => {
	if (a == null && b == null) return true;
	if (a == null || b == null) return false;

	return (
		a.expiry_duration_type === b.expiry_duration_type &&
		(a.expiry_duration_length ?? null) === (b.expiry_duration_length ?? null) &&
		(a.max ?? null) === (b.max ?? null) &&
		(a.max_percentage ?? null) === (b.max_percentage ?? null)
	);
};

// Compare user-controlled item fields only; API joins/display are ignored.
export const itemsEqual = (a: PlanItemInput, b: PlanItemInput): boolean => {
	return (
		a.feature_id === b.feature_id &&
		(a.entity_feature_id ?? null) === (b.entity_feature_id ?? null) &&
		(a.included ?? 0) === (b.included ?? 0) &&
		(a.unlimited ?? false) === (b.unlimited ?? false) &&
		(a.reset?.interval ?? null) === (b.reset?.interval ?? null) &&
		(a.reset?.interval_count ?? 1) === (b.reset?.interval_count ?? 1) &&
		itemPricesEqual(a.price, b.price) &&
		rolloversEqual(a.rollover, b.rollover) &&
		prorationsEqual(a.proration, b.proration)
	);
};

const removeFiltersEqual = (a: PlanItemFilter, b: PlanItemFilter): boolean =>
	a.feature_id === b.feature_id &&
	(a.billing_method ?? null) === (b.billing_method ?? null) &&
	(a.interval ?? null) === (b.interval ?? null) &&
	normalizeIntervalCount({
		interval: a.interval,
		intervalCount: a.interval_count,
	}) ===
		normalizeIntervalCount({
			interval: b.interval,
			intervalCount: b.interval_count,
		});

const arraysEqual = <T>({
	left,
	right,
	equals,
}: {
	left?: T[];
	right?: T[];
	equals: (left: T, right: T) => boolean;
}): boolean => {
	if (!left?.length && !right?.length) return true;
	if (!left || !right || left.length !== right.length) return false;

	const unmatched = [...right];
	return left.every((item) => {
		const index = unmatched.findIndex((other) => equals(item, other));
		if (index === -1) return false;
		unmatched.splice(index, 1);
		return true;
	});
};

export const customizePlanV1DiffsEqual = ({
	left,
	right,
}: {
	left?: DiffedCustomizePlanV1 | null;
	right?: DiffedCustomizePlanV1 | null;
}): boolean => {
	const a = left ?? {};
	const b = right ?? {};

	return (
		pricesEqual(a.price, b.price) &&
		freeTrialsEqual(a.free_trial, b.free_trial) &&
		arraysEqual({
			left: a.add_items,
			right: b.add_items,
			equals: itemsEqual,
		}) &&
		arraysEqual({
			left: a.remove_items,
			right: b.remove_items,
			equals: removeFiltersEqual,
		})
	);
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
