import type { NumberMatcher, PlanFilter, StringMatcher } from "@autumn/shared";

export type FilterField =
	| "customer_id"
	| "plan_id"
	| "custom"
	| "paid"
	| "recurring"
	| "price"
	| "item_feature_id"
	| "item_unlimited";

export type FilterOperator =
	| "is"
	| "is_not"
	| "in"
	| "not_in"
	| "regex"
	| "starts_with"
	| "exists"
	| "not_exists"
	| "none";

export type FilterRule = {
	field: FilterField;
	operator: FilterOperator;
	values: string[];
};

export type FilterGroupData = {
	rules: FilterRule[];
};

export const FILTER_FIELD_OPTIONS: {
	value: FilterField;
	label: string;
}[] = [
	{ value: "customer_id", label: "Customer" },
	{ value: "plan_id", label: "Plan" },
	{ value: "custom", label: "Custom" },
	{ value: "paid", label: "Paid" },
	{ value: "recurring", label: "Recurring" },
	{ value: "price", label: "Base Price" },
	{ value: "item_feature_id", label: "Feature" },
	{ value: "item_unlimited", label: "Unlimited" },
];

type OperatorOption = { value: FilterOperator; label: string };
export type FieldConfig = {
	operators: OperatorOption[];
	valueType: "string" | "boolean" | "plan" | "none";
};

const STRING_MATCH_OPERATORS: OperatorOption[] = [
	{ value: "is", label: "is" },
	{ value: "is_not", label: "is not" },
	{ value: "in", label: "in" },
	{ value: "not_in", label: "not in" },
];

// Plan adds "has none" — selects customers with no active plans at all
// (compiles to the `$none` quantifier, not a per-plan matcher).
const PLAN_OPERATORS: OperatorOption[] = [
	...STRING_MATCH_OPERATORS,
	{ value: "none", label: "has none" },
];

const BOOLEAN_ONLY: FieldConfig = {
	operators: [{ value: "is", label: "is" }],
	valueType: "boolean",
};

const NULLABLE_ONLY: FieldConfig = {
	operators: [
		{ value: "exists", label: "exists" },
		{ value: "not_exists", label: "does not exist" },
	],
	valueType: "none",
};

export const FIELD_CONFIGS: Record<FilterField, FieldConfig> = {
	customer_id: { operators: STRING_MATCH_OPERATORS, valueType: "string" },
	plan_id: { operators: PLAN_OPERATORS, valueType: "plan" },
	custom: BOOLEAN_ONLY,
	paid: BOOLEAN_ONLY,
	recurring: BOOLEAN_ONLY,
	price: NULLABLE_ONLY,
	item_feature_id: { operators: STRING_MATCH_OPERATORS, valueType: "string" },
	item_unlimited: BOOLEAN_ONLY,
};

function stringMatcherToRule(
	field: FilterField,
	matcher: StringMatcher | undefined,
): FilterRule | null {
	if (matcher === undefined) return null;
	if (matcher === null) return { field, operator: "is", values: [] };
	if (typeof matcher === "string")
		return { field, operator: "is", values: matcher ? [matcher] : [] };
	if (matcher.$eq !== undefined)
		return {
			field,
			operator: "is",
			values: matcher.$eq ? [matcher.$eq] : [],
		};
	if (matcher.$ne !== undefined)
		return {
			field,
			operator: "is_not",
			values: matcher.$ne ? [matcher.$ne] : [],
		};
	if (matcher.$in !== undefined)
		return { field, operator: "in", values: matcher.$in };
	if (matcher.$nin !== undefined)
		return { field, operator: "not_in", values: matcher.$nin };
	if (matcher.$regex !== undefined)
		return { field, operator: "regex", values: [matcher.$regex] };
	if (matcher.$startsWith !== undefined)
		return {
			field,
			operator: "starts_with",
			values: [matcher.$startsWith],
		};
	return { field, operator: "is", values: [] };
}

export function ruleToStringMatcher(rule: FilterRule): StringMatcher {
	if (
		rule.operator === "in" ||
		(rule.operator === "is" && rule.values.length > 1)
	)
		return { $in: rule.values };

	const val = rule.values[0];
	switch (rule.operator) {
		case "is":
			return val ?? "";
		case "is_not":
			return { $ne: val ?? "" };
		case "in":
			return { $in: rule.values };
		case "not_in":
			return { $nin: rule.values };
		case "regex":
			return { $regex: val ?? "" };
		case "starts_with":
			return { $startsWith: val ?? "" };
		default:
			return val ?? "";
	}
}

function booleanRule(field: FilterField, value: boolean): FilterRule {
	return { field, operator: "is", values: [String(value)] };
}

function nullableToRule(field: FilterField, value: unknown): FilterRule | null {
	if (value === undefined) return null;
	if (value === null) return { field, operator: "not_exists", values: [] };
	return { field, operator: "exists", values: [] };
}

// Plan selections are encoded as value keys: "<planId>" (any version) or
// "<planId>:<version>" (a specific version). Version is therefore always bound
// to its plan — there is no standalone version field.
const PLAN_KEY_SEPARATOR = ":";

export type PlanSelection = { planId: string; version?: number };

export function parsePlanKey(key: string): PlanSelection {
	const separatorIndex = key.lastIndexOf(PLAN_KEY_SEPARATOR);
	if (separatorIndex === -1) return { planId: key };
	const version = Number.parseInt(key.slice(separatorIndex + 1), 10);
	if (Number.isNaN(version)) return { planId: key };
	return { planId: key.slice(0, separatorIndex), version };
}

export function makePlanKey({ planId, version }: PlanSelection): string {
	return version === undefined
		? planId
		: `${planId}${PLAN_KEY_SEPARATOR}${version}`;
}

function selectionToFilter({ planId, version }: PlanSelection): PlanFilter {
	return version === undefined
		? { plan_id: planId }
		: { plan_id: planId, version };
}

/**
 * Plan-selection value keys → the PlanFilter for one quantifier. Version-less
 * keys collapse to `plan_id` / `$in`; any pinned version forces an `$or` of
 * `{ plan_id, version }` branches (each compiles to a single bound EXISTS).
 */
export function planKeysToFilter(keys: string[]): PlanFilter {
	const selections = keys.map(parsePlanKey);
	if (selections.every((s) => s.version === undefined)) {
		const ids = selections.map((s) => s.planId);
		return { plan_id: ids.length === 1 ? ids[0] : { $in: ids } };
	}
	if (selections.length === 1) return selectionToFilter(selections[0]);
	return { $or: selections.map(selectionToFilter) };
}

const PLAN_SELECTION_KEYS = new Set(["plan_id", "version"]);

function planIdsFromMatcher(
	matcher: StringMatcher | undefined,
): string[] | null {
	if (typeof matcher === "string") return [matcher];
	if (matcher && typeof matcher === "object") {
		if (matcher.$eq) return [matcher.$eq];
		if (matcher.$in) return matcher.$in;
	}
	return null;
}

// A version pin folds into a plan key only as a single concrete number — bare
// `N` or `{ $eq: N }`. Returns `undefined` when absent, or `"unfoldable"` for
// matcher forms ($in, ranges, $ne, null) a key can't carry.
function pinnedVersion(
	matcher: NumberMatcher | undefined,
): number | undefined | "unfoldable" {
	if (matcher === undefined) return undefined;
	if (typeof matcher === "number") return matcher;
	if (
		typeof matcher === "object" &&
		matcher !== null &&
		typeof matcher.$eq === "number" &&
		Object.keys(matcher).length === 1
	)
		return matcher.$eq;
	return "unfoldable";
}

/** A PlanFilter that is purely a plan selection (`plan_id` and an optional
 *  single-version pin) → its value keys, else null. */
function pureSelectionKeys(filter: PlanFilter): string[] | null {
	if (filter.plan_id === undefined) return null;
	if (Object.keys(filter).some((key) => !PLAN_SELECTION_KEYS.has(key)))
		return null;
	const ids = planIdsFromMatcher(filter.plan_id);
	if (ids === null) return null;
	const version = pinnedVersion(filter.version);
	if (version === "unfoldable") return null;
	return ids.map((planId) => makePlanKey({ planId, version }));
}

/**
 * Decode a quantifier's PlanFilter to plan-selection keys, or null when it
 * isn't a plan selection (a non-plan field, or a legacy `$or` of full filters
 * — those are handled by `planFilterToGroups`).
 */
export function planFilterToPlanKeys(filter: PlanFilter): string[] | null {
	if (filter.$or) {
		if (Object.keys(filter).some((key) => key !== "$or")) return null;
		const keys: string[] = [];
		for (const branch of filter.$or) {
			const branchKeys = pureSelectionKeys(branch);
			if (branchKeys === null) return null;
			keys.push(...branchKeys);
		}
		return keys;
	}
	return pureSelectionKeys(filter);
}

function planKeysToRule(keys: string[]): FilterRule {
	return {
		field: "plan_id",
		operator: keys.length > 1 ? "in" : "is",
		values: keys,
	};
}

export function planFilterToGroups(filter: PlanFilter): FilterGroupData[] {
	// A pure plan selection is a single plan row (version folded into the keys).
	const planKeys = planFilterToPlanKeys(filter);
	if (planKeys !== null)
		return [{ rules: planKeys.length > 0 ? [planKeysToRule(planKeys)] : [] }];

	const mainRules: FilterRule[] = [];

	const planIdRule = stringMatcherToRule("plan_id", filter.plan_id);
	if (planIdRule) mainRules.push(planIdRule);

	if (filter.custom !== undefined)
		mainRules.push(booleanRule("custom", filter.custom));

	if (filter.paid !== undefined)
		mainRules.push(booleanRule("paid", filter.paid));

	if (filter.recurring !== undefined)
		mainRules.push(booleanRule("recurring", filter.recurring));

	const priceRule = nullableToRule("price", filter.price);
	if (priceRule) mainRules.push(priceRule);

	if (filter.item !== undefined) {
		const inner =
			typeof filter.item === "object" && filter.item !== null
				? filter.item
				: {};

		const featureRule = stringMatcherToRule(
			"item_feature_id",
			inner.feature_id as StringMatcher | undefined,
		);
		if (featureRule) mainRules.push(featureRule);

		if (inner.unlimited !== undefined)
			mainRules.push(booleanRule("item_unlimited", Boolean(inner.unlimited)));
	}

	const groups: FilterGroupData[] =
		mainRules.length > 0 ? [{ rules: mainRules }] : [];

	// Legacy `$or` of full filters — each branch is its own OR-group.
	if (filter.$or) {
		for (const orFilter of filter.$or) {
			const orGroups = planFilterToGroups(orFilter);
			if (orGroups.length > 0) groups.push(orGroups[0]);
		}
	}

	return groups.length > 0 ? groups : [{ rules: [] }];
}

export function customerIdToStrings(
	matcher: StringMatcher | undefined,
): string[] {
	if (matcher === undefined || matcher === null) return [];
	if (typeof matcher === "string") return matcher ? [matcher] : [];
	if (matcher.$eq) return [matcher.$eq];
	if (matcher.$ne) return [matcher.$ne];
	if (matcher.$in) return matcher.$in;
	if (matcher.$nin) return matcher.$nin;
	return [];
}

export function stringsToCustomerId(ids: string[]): StringMatcher | undefined {
	const filtered = ids.map((s) => s.trim()).filter(Boolean);
	if (filtered.length === 0) return undefined;
	if (filtered.length === 1) return filtered[0];
	return { $in: filtered };
}
