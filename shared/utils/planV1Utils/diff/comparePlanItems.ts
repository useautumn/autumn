import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";
import type { CreatePlanItemParamsV1 } from "@api/products/items/crud/createPlanItemParamsV1.js";
import type { PlanItemFilter } from "@api/products/items/filter/planItemFilter.js";
import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig.js";

type ApiPlanItem = ApiPlanV1["items"][number];
export type PlanItemInput = ApiPlanItem | CreatePlanItemParamsV1;
type PlanItemPrice = NonNullable<PlanItemInput["price"]>;
type PlanItemRollover = NonNullable<PlanItemInput["rollover"]>;
type PlanItemProration = NonNullable<PlanItemInput["proration"]>;

export type AdditionalCurrencyInput = {
	currency: string;
	amount?: number | null;
	flat_amount?: number | null;
};

export type BasePriceInput = {
	amount: number;
	interval?: string | null;
	interval_count?: number | null;
	additional_currencies?: AdditionalCurrencyInput[] | null;
};

/** Add/remove of a catalog currency is compatible; only shared-currency
 * amount mismatches differ. */
export const additionalCurrenciesCompatible = (
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

/** Unset `interval_count` is 1 when an interval is set; meaningless otherwise. */
export const normalizeIntervalCount = ({
	interval,
	intervalCount,
}: {
	interval?: string | null;
	intervalCount?: number | null;
}): number | "" => (interval ? (intervalCount ?? 1) : (intervalCount ?? ""));

export const pricesEqual = (
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

/** User-controlled item fields only. `included` 0 / `unlimited` false /
 * `pooled` false / `interval_count` 1 are the unset defaults. */
export const itemsEqual = (a: PlanItemInput, b: PlanItemInput): boolean => {
	return (
		a.feature_id === b.feature_id &&
		(a.entity_feature_id ?? null) === (b.entity_feature_id ?? null) &&
		(a.pooled ?? false) === (b.pooled ?? false) &&
		(a.included ?? 0) === (b.included ?? 0) &&
		(a.unlimited ?? false) === (b.unlimited ?? false) &&
		(a.reset?.interval ?? null) === (b.reset?.interval ?? null) &&
		(a.reset?.interval_count ?? 1) === (b.reset?.interval_count ?? 1) &&
		itemPricesEqual(a.price, b.price) &&
		rolloversEqual(a.rollover, b.rollover) &&
		prorationsEqual(a.proration, b.proration)
	);
};

export const planItemFiltersEqual = (
	a: PlanItemFilter,
	b: PlanItemFilter,
): boolean =>
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

/** Omitted and `[]` are the same empty list. Order does not matter. */
export const arraysEqual = <T>({
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
