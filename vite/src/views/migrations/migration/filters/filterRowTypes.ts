import type { NumberMatcher, PlanFilter, StringMatcher } from "@autumn/shared";
import {
	makePlanKey,
	type PlanSelection,
	parsePlanKey,
} from "@/lib/planSelectionKeys";

export { makePlanKey, parsePlanKey, type PlanSelection };

export type FilterField =
	| "customer_id"
	| "plan_id"
	| "custom"
	| "paid"
	| "recurring"
	| "price";

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
];

type OperatorOption = { value: FilterOperator; label: string };
export type FieldConfig = {
	operators: OperatorOption[];
	valueType: "string" | "boolean" | "plan" | "none" | "customer";
};

const STRING_MATCH_OPERATORS: OperatorOption[] = [
	{ value: "is", label: "is" },
	{ value: "is_not", label: "is not" },
	{ value: "in", label: "in" },
	{ value: "not_in", label: "not in" },
];

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
	customer_id: { operators: STRING_MATCH_OPERATORS, valueType: "customer" },
	plan_id: { operators: PLAN_OPERATORS, valueType: "plan" },
	custom: BOOLEAN_ONLY,
	paid: BOOLEAN_ONLY,
	recurring: BOOLEAN_ONLY,
	price: NULLABLE_ONLY,
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

function booleanRule(field: FilterField, value: boolean): FilterRule {
	return { field, operator: "is", values: [String(value)] };
}

function nullableToRule(field: FilterField, value: unknown): FilterRule | null {
	if (value === undefined) return null;
	if (value === null) return { field, operator: "not_exists", values: [] };
	return { field, operator: "exists", values: [] };
}

function selectionToFilter({ planId, version }: PlanSelection): PlanFilter {
	return version === undefined
		? { plan_id: planId }
		: { plan_id: planId, version };
}

export function planKeysToFilter(keys: string[]): PlanFilter {
	const selections = [
		...new Set(keys.map((key) => key.trim()).filter(Boolean)),
	].map(parsePlanKey);
	if (selections.length === 0) return {};
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

export function planFilterToPlanKeys(filter: PlanFilter): string[] | null {
	const {
		custom: _custom,
		paid: _paid,
		recurring: _recurring,
		price: _price,
		...selection
	} = filter;
	if (selection.$or) {
		if (Object.keys(selection).some((key) => key !== "$or")) return null;
		const keys: string[] = [];
		for (const branch of selection.$or) {
			const branchKeys = pureSelectionKeys(branch);
			if (branchKeys === null) return null;
			keys.push(...branchKeys);
		}
		return keys;
	}
	return pureSelectionKeys(selection);
}

function planKeysToRule(keys: string[]): FilterRule {
	return {
		field: "plan_id",
		operator: keys.length > 1 ? "in" : "is",
		values: keys,
	};
}

export function planFilterToGroups(filter: PlanFilter): FilterGroupData[] {
	const { custom, paid, recurring, price, ...selection } = filter;
	const planKeys = planFilterToPlanKeys(selection);
	if (planKeys !== null) {
		const rules: FilterRule[] = [];
		if (planKeys.length > 0) rules.push(planKeysToRule(planKeys));
		if (custom !== undefined) rules.push(booleanRule("custom", custom));
		if (paid !== undefined) rules.push(booleanRule("paid", paid));
		if (recurring !== undefined)
			rules.push(booleanRule("recurring", recurring));
		const priceRule = nullableToRule("price", price);
		if (priceRule) rules.push(priceRule);
		return [{ rules }];
	}

	const mainRules: FilterRule[] = [];

	const planIdRule = stringMatcherToRule("plan_id", filter.plan_id);
	if (planIdRule) {
		const version = pinnedVersion(filter.version);
		if (typeof version === "number")
			planIdRule.values = planIdRule.values.map((planId) =>
				makePlanKey({ planId, version }),
			);
		mainRules.push(planIdRule);
	}

	if (filter.custom !== undefined)
		mainRules.push(booleanRule("custom", filter.custom));

	if (filter.paid !== undefined)
		mainRules.push(booleanRule("paid", filter.paid));

	if (filter.recurring !== undefined)
		mainRules.push(booleanRule("recurring", filter.recurring));

	const priceRule = nullableToRule("price", filter.price);
	if (priceRule) mainRules.push(priceRule);

	const groups: FilterGroupData[] =
		mainRules.length > 0 ? [{ rules: mainRules }] : [];

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
