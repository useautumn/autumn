import {
	numberMatchersAreSame,
	stringMatchersAreSame,
} from "../../../migrations/filters/compare/matchersAreSame.js";
import type { CustomerFilter } from "../../../migrations/filters/customerFilter.js";
import type { StringMatcher } from "../../../migrations/filters/matcher.js";
import type { PlanFilter } from "../../../migrations/filters/planFilter.js";
import type { PlanItemFilter } from "../../../migrations/filters/planItemFilter.js";

/** Unset vs `false` is a real difference — unset does not constrain. */
const booleansAreSame = (left?: boolean, right?: boolean): boolean =>
	left === right;

type NullEqualityFilter = {
	$eq?: null;
	$ne?: null;
} | null;

const asNullEquality = (
	value: PlanFilter["price"] | PlanItemFilter["price"] | PlanItemFilter["rollover"],
): NullEqualityFilter | undefined => {
	if (value === undefined) return undefined;
	if (value === null) return null;
	return {
		$eq: "$eq" in value ? value.$eq : undefined,
		$ne: "$ne" in value ? value.$ne : undefined,
	};
};

const nullEqualityFiltersAreSame = (
	left: PlanFilter["price"] | PlanItemFilter["price"] | PlanItemFilter["rollover"],
	right: PlanFilter["price"] | PlanItemFilter["price"] | PlanItemFilter["rollover"],
): boolean => {
	const a = asNullEquality(left);
	const b = asNullEquality(right);
	if (a === undefined && b === undefined) return true;
	if (a === undefined || b === undefined) return false;
	if (a === null) return b === null || isEqNull(b);
	if (b === null) return isEqNull(a);
	if (isEqNull(a) && isEqNull(b)) return true;
	return a.$ne === b.$ne && a.$eq === b.$eq;
};

const isEqNull = (filter: { $eq?: null; $ne?: null }) =>
	filter.$eq === null && filter.$ne === undefined;

const itemPriceBillingMethod = (
	price: Exclude<PlanItemFilter["price"], null | undefined>,
): StringMatcher | undefined =>
	"billing_method" in price ? price.billing_method : undefined;

const itemPriceFiltersAreSame = (
	left: PlanItemFilter["price"],
	right: PlanItemFilter["price"],
): boolean => {
	if (!nullEqualityFiltersAreSame(left, right)) return false;
	if (left == null || right == null) return true;
	return stringMatchersAreSame(
		itemPriceBillingMethod(left),
		itemPriceBillingMethod(right),
	);
};

const itemFiltersAreSame = (
	left: PlanFilter["item"],
	right: PlanFilter["item"],
): boolean => {
	if (left === undefined && right === undefined) return true;
	if (left === undefined || right === undefined) return false;
	if (isItemQuantifier(left) || isItemQuantifier(right)) {
		if (!isItemQuantifier(left) || !isItemQuantifier(right)) return false;
		return (
			planItemFiltersAreSame(left.$some, right.$some) &&
			planItemFiltersAreSame(left.$every, right.$every) &&
			planItemFiltersAreSame(left.$none, right.$none)
		);
	}
	return planItemFiltersAreSame(left, right);
};

const isItemQuantifier = (
	item: object,
): item is {
	$some?: PlanItemFilter;
	$every?: PlanItemFilter;
	$none?: PlanItemFilter;
} => "$some" in item || "$every" in item || "$none" in item;

const planItemFiltersAreSame = (
	left?: PlanItemFilter,
	right?: PlanItemFilter,
): boolean => {
	if (left === undefined && right === undefined) return true;
	if (left === undefined || right === undefined) return false;
	return (
		stringMatchersAreSame(left.feature_id, right.feature_id) &&
		booleansAreSame(left.unlimited, right.unlimited) &&
		itemPriceFiltersAreSame(left.price, right.price) &&
		nullEqualityFiltersAreSame(left.rollover, right.rollover)
	);
};

/** Empty `$or` matches nothing; omitted `$or` means no OR. Not the same. */
const orBranchesAreSame = (
	left?: PlanFilter[],
	right?: PlanFilter[],
): boolean => {
	if (left === undefined && right === undefined) return true;
	if (left === undefined || right === undefined) return false;
	if (left.length !== right.length) return false;
	const unmatched = [...right];
	return left.every((branch) => {
		const index = unmatched.findIndex((other) =>
			planFiltersAreSame({ left: branch, right: other }),
		);
		if (index === -1) return false;
		unmatched.splice(index, 1);
		return true;
	});
};

export const planFiltersAreSame = ({
	left,
	right,
}: {
	left?: PlanFilter | null;
	right?: PlanFilter | null;
}): boolean => {
	const a = left ?? {};
	const b = right ?? {};

	const diffs = {
		plan_id: !stringMatchersAreSame(a.plan_id, b.plan_id),
		version: !numberMatchersAreSame(a.version, b.version),
		price: !nullEqualityFiltersAreSame(a.price, b.price),
		addon: !booleansAreSame(a.addon, b.addon),
		paid: !booleansAreSame(a.paid, b.paid),
		recurring: !booleansAreSame(a.recurring, b.recurring),
		custom: !booleansAreSame(a.custom, b.custom),
		item: !itemFiltersAreSame(a.item, b.item),
		$or: !orBranchesAreSame(a.$or, b.$or),
	};

	return !Object.values(diffs).some(Boolean);
};

/** Equality / `$in` plan_ids only — `$ne` / `$nin` are exclusions, not targets. */
export const collectPlanFilterPlanIds = ({
	planFilter,
}: {
	planFilter?: PlanFilter | null;
}): string[] => {
	if (!planFilter) return [];
	return [
		...stringMatcherTargetIds(planFilter.plan_id),
		...(planFilter.$or ?? []).flatMap((branch) =>
			collectPlanFilterPlanIds({ planFilter: branch }),
		),
	];
};

const isPlanQuantifier = (
	plan: object,
): plan is {
	$some?: PlanFilter;
	$every?: PlanFilter;
	$none?: PlanFilter;
} => "$some" in plan || "$every" in plan || "$none" in plan;

export const collectCustomerPlanIds = ({
	plan,
}: {
	plan?: CustomerFilter["plan"];
}): string[] => {
	if (!plan) return [];
	if (isPlanQuantifier(plan)) {
		return [
			...collectPlanFilterPlanIds({ planFilter: plan.$some }),
			...collectPlanFilterPlanIds({ planFilter: plan.$every }),
			...collectPlanFilterPlanIds({ planFilter: plan.$none }),
		];
	}
	return collectPlanFilterPlanIds({ planFilter: plan });
};

const stringMatcherTargetIds = (matcher?: StringMatcher): string[] => {
	if (matcher === undefined || matcher === null) return [];
	if (typeof matcher === "string") return [matcher];
	return [
		...(typeof matcher.$eq === "string" ? [matcher.$eq] : []),
		...(matcher.$in ?? []),
	];
};

export const formatPlanFilter = (planFilter?: PlanFilter | null): string => {
	const filter = planFilter ?? {};
	const parts = [
		filter.plan_id !== undefined
			? `plan_id=${JSON.stringify(filter.plan_id)}`
			: undefined,
		filter.version !== undefined
			? `version=${JSON.stringify(filter.version)}`
			: undefined,
		filter.custom !== undefined ? `custom=${filter.custom}` : undefined,
		filter.addon !== undefined ? `addon=${filter.addon}` : undefined,
		filter.paid !== undefined ? `paid=${filter.paid}` : undefined,
		filter.recurring !== undefined ? `recurring=${filter.recurring}` : undefined,
		filter.price !== undefined
			? `price=${JSON.stringify(filter.price)}`
			: undefined,
		filter.item !== undefined ? `item=${JSON.stringify(filter.item)}` : undefined,
		filter.$or
			? `$or=[${filter.$or.map((branch) => formatPlanFilter(branch)).join(" | ")}]`
			: undefined,
	].filter((part) => part !== undefined);
	return `{ ${parts.join(" ")} }`;
};
