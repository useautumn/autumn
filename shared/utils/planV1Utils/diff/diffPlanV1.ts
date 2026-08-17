// Deep imports, not the "@autumn/shared" barrel: the barrel re-exports
// updatePlanParamsV1, which reaches back here via variants/updateVariantParams,
// and the resulting cycle throws a TDZ ReferenceError depending on load order.
import {
	CustomizePlanV1BaseSchema,
	refineCustomizePlanV1Schema,
} from "@api/billing/common/customizePlan/customizePlanV1.js";
import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";
import type { ApiPlanLicenseV1 } from "@api/products/apiPlanLicenseV1.js";
import type { BasePriceParams } from "@api/products/components/basePrice/basePrice.js";
import type { CreatePlanItemParamsV1 } from "@api/products/items/crud/createPlanItemParamsV1.js";
import type { PlanItemFilter } from "@api/products/items/filter/planItemFilter.js";
import type {
	CustomizePlanLicense,
	RemovePlanLicense,
} from "@models/licenseModels/licenseModels.js";
import { FreeTrialDuration } from "@models/productModels/freeTrialModels/freeTrialEnums.js";
import type { z } from "zod/v4";
import {
	arraysEqual,
	itemsEqual,
	normalizeIntervalCount,
	planItemFiltersEqual,
	pricesEqual,
} from "./comparePlanItems.js";
import {
	customizePlanLicensesAreSame,
	removePlanLicensesAreSame,
} from "./comparePlanLicenses.js";
import { diffPlanLicenses } from "./diffPlanLicenses.js";

export { itemsEqual } from "./comparePlanItems.js";
export {
	customizePlanLicensesAreSame,
	hasLicenseCustomize,
	licenseCustomizePatchesAreSame,
	licenseCustomizesAreSame,
	planLicensesAreSame,
	removePlanLicensesAreSame,
} from "./comparePlanLicenses.js";
export { diffPlanLicenses } from "./diffPlanLicenses.js";

export const DiffedCustomizePlanV1Schema = refineCustomizePlanV1Schema(
	CustomizePlanV1BaseSchema.omit({
		items: true,
		upsert_licenses: true,
		remove_licenses: true,
	}).strict(),
	{ includeItems: false, includeLicenses: false },
);

/** Content schema stays license-free (core / preview parse). In-memory diffs
 * carry the license patch; PlanChangeCustomizeV0Schema and VariantCustomizeSchema
 * validate it. */
export type DiffedCustomizePlanV1 = z.infer<
	typeof DiffedCustomizePlanV1Schema
> & {
	upsert_licenses?: CustomizePlanLicense[];
	remove_licenses?: RemovePlanLicense[];
};

/** ApiPlanV1 plus optional licenses[] — omitted means no license lane. */
export type DiffablePlanV1 = ApiPlanV1 & {
	licenses?: ApiPlanLicenseV1[];
};

type ApiPlanItem = ApiPlanV1["items"][number];

type PlanParamsMapperOptions = {
	includeInternalIds?: boolean;
};

export const toBasePriceParams = (
	price: NonNullable<ApiPlanV1["price"]> | BasePriceParams,
	{ includeInternalIds = false }: PlanParamsMapperOptions = {},
): BasePriceParams => ({
	amount: price.amount,
	interval: price.interval,
	...(price.interval_count !== undefined
		? { interval_count: price.interval_count }
		: {}),
	...(price.additional_currencies?.length
		? { additional_currencies: price.additional_currencies }
		: {}),
	...(includeInternalIds && price.entitlement_id !== undefined
		? { entitlement_id: price.entitlement_id }
		: {}),
	...(includeInternalIds && price.price_id !== undefined
		? { price_id: price.price_id }
		: {}),
	...(includeInternalIds &&
	"stripe_price_id" in price &&
	price.stripe_price_id !== undefined
		? { stripe_price_id: price.stripe_price_id }
		: {}),
});

export const toCreatePlanItemParams = (
	item: ApiPlanItem,
	{ includeInternalIds = false }: PlanParamsMapperOptions = {},
): CreatePlanItemParamsV1 => {
	const out: CreatePlanItemParamsV1 = { feature_id: item.feature_id };
	if (item.entity_feature_id !== undefined)
		out.entity_feature_id = item.entity_feature_id;
	// Only when true: false is the schema default, so emitting it would leak a
	// no-op field into every migration diff.
	if (item.pooled) out.pooled = item.pooled;
	if (includeInternalIds && item.entitlement_id !== undefined)
		out.entitlement_id = item.entitlement_id;
	if (includeInternalIds && item.price_id !== undefined)
		out.price_id = item.price_id;
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

export enum PlanItemMatchPrecision {
	FeatureBillingMethodCadence = "feature_billing_method_cadence",
	FeatureCadence = "feature_cadence",
}

export const buildPlanItemKey = ({
	item,
	matchPrecision = PlanItemMatchPrecision.FeatureBillingMethodCadence,
}: {
	item: MatchKeyItem;
	matchPrecision?: PlanItemMatchPrecision;
}): string => {
	const billingMethod = item.price?.billing_method ?? "";
	const interval = item.price?.interval ?? item.reset?.interval ?? "";
	const intervalCount = normalizeIntervalCount({
		interval,
		intervalCount: item.price?.interval_count ?? item.reset?.interval_count,
	});
	return [
		item.feature_id,
		...(matchPrecision === PlanItemMatchPrecision.FeatureBillingMethodCadence
			? [billingMethod]
			: []),
		interval,
		intervalCount,
	].join("|");
};

/** The identity used across plan diffs: feature, billing method, and cadence. */
export const composeMatchKey = (item: MatchKeyItem): string =>
	buildPlanItemKey({ item });

/** Match key for a remove_items filter, in the same format as composeMatchKey
 * (buildRemoveFilter already flattens the matched item's fields onto it). */
export const planItemFilterMatchKey = (filter: PlanItemFilter): string =>
	`${filter.feature_id}|${filter.billing_method ?? ""}|${filter.interval ?? ""}|${normalizeIntervalCount(
		{
			interval: filter.interval,
			intervalCount: filter.interval_count,
		},
	)}`;

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
			equals: planItemFiltersEqual,
		}) &&
		arraysEqual({
			left: a.upsert_licenses,
			right: b.upsert_licenses,
			equals: (left, right) =>
				customizePlanLicensesAreSame({ left, right }),
		}) &&
		arraysEqual({
			left: a.remove_licenses,
			right: b.remove_licenses,
			equals: (left, right) => removePlanLicensesAreSame({ left, right }),
		})
	);
};

// Modify-in-place is expressed as remove + add ("out with the old, in with the new").
export const diffPlanV1 = ({
	from,
	to,
}: {
	from: DiffablePlanV1;
	to: DiffablePlanV1;
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

	Object.assign(diff, diffPlanLicenses({ from: from.licenses, to: to.licenses }));

	return diff;
};
