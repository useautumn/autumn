import type { NumberMatcher, PlanFilter, StringMatcher } from "@autumn/shared";
import {
	createFieldRegistry,
	filterToRows,
} from "@/components/filters/fieldRegistry";
import type {
	FilterOperatorOption,
	FilterRow,
	FilterRowGroup,
	FilterField as RegistryField,
} from "@/components/filters/types";
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

export type FilterRule = FilterRow<FilterField, FilterOperator>;

export type FilterGroupData = FilterRowGroup<FilterField, FilterOperator>;

/** One group's flat filter: plan-level fields plus the hoisted `customer_id`. */
export type MigrationRowFilter = PlanFilter & { customer_id?: StringMatcher };

type OperatorOption = FilterOperatorOption<FilterOperator>;

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
	{ value: "none", label: "has none", hidesValue: true },
];

type MigrationFilterField = RegistryField<
	MigrationRowFilter,
	FilterField,
	FilterOperator
>;

const booleanField = ({
	path,
	label,
}: {
	path: "custom" | "paid" | "recurring";
	label: string;
}): MigrationFilterField => ({
	path,
	label,
	valueInput: "boolean",
	operators: [{ value: "is", label: "is" }],
	toFilter: ({ values }) => ({ [path]: values[0] === "true" }),
	fromFilter: (filter) =>
		filter[path] === undefined ? null : booleanRule(path, filter[path]),
});

export const MIGRATION_FILTER_REGISTRY = createFieldRegistry<
	MigrationRowFilter,
	FilterField,
	FilterOperator
>({
	defaultPath: "plan_id",
	fields: [
		{
			path: "customer_id",
			label: "Customer",
			valueInput: "customer",
			operators: STRING_MATCH_OPERATORS,
			toFilter: (rule) => {
				const matcher = ruleToCustomerIdMatcher(rule);
				return matcher === undefined ? null : { customer_id: matcher };
			},
			fromFilter: ({ customer_id }) => {
				const ids = customerIdToStrings(customer_id);
				if (ids.length === 0) return null;
				return {
					field: "customer_id",
					operator: inferCustomerIdOperator(customer_id, ids.length),
					values: ids,
				};
			},
		},
		{
			path: "plan_id",
			label: "Plan",
			valueInput: "plan",
			operators: PLAN_OPERATORS,
			toFilter: ({ values }) =>
				values.some((value) => value.trim()) ? planKeysToFilter(values) : null,
			fromFilter: planRuleFromFilter,
		},
		booleanField({ path: "custom", label: "Custom" }),
		booleanField({ path: "paid", label: "Paid" }),
		booleanField({ path: "recurring", label: "Recurring" }),
		{
			path: "price",
			label: "Base price",
			valueInput: "none",
			operators: [
				{ value: "exists", label: "exists" },
				{ value: "not_exists", label: "does not exist" },
			],
			toFilter: ({ operator }) => ({
				price: operator === "exists" ? { $ne: null } : null,
			}),
			fromFilter: ({ price }) => nullableToRule("price", price),
		},
	],
});

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

/**
 * Plan-selection value keys → the PlanFilter for one quantifier. Version-less
 * keys collapse to `plan_id` / `$in`; any pinned version forces an `$or` of
 * `{ plan_id, version }` branches (each compiles to a single bound EXISTS).
 */
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
	// Property siblings (`custom`, `paid`, …) are not part of the selection.
	// Catalog drafts are `{ $or: [{ plan_id, version }, …], custom: false }`.
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

function planRuleFromFilter(filter: PlanFilter): FilterRule | null {
	const keys = planFilterToPlanKeys(filter);
	if (keys !== null) return keys.length > 0 ? planKeysToRule(keys) : null;

	const rule = stringMatcherToRule("plan_id", filter.plan_id);
	if (!rule) return null;
	// Sibling fields (e.g. custom) keep this off the pure-selection path, so
	// fold a concrete version pin into the plan keys here or it's lost.
	const version = pinnedVersion(filter.version);
	if (typeof version !== "number") return rule;
	return {
		...rule,
		values: rule.values.map((planId) => makePlanKey({ planId, version })),
	};
}

export function planFilterToGroups(filter: PlanFilter): FilterGroupData[] {
	const rules = filterToRows({ registry: MIGRATION_FILTER_REGISTRY, filter });
	// Property siblings (`custom`, `paid`, …) must not hide a `$or` of plan
	// selections — catalog drafts are `{ $or: [{ plan_id, version }, …], custom: false }`.
	if (planFilterToPlanKeys(filter) !== null) return [{ rules }];

	const groups: FilterGroupData[] = rules.length > 0 ? [{ rules }] : [];
	// Legacy `$or` of full filters — each branch is its own OR-group.
	for (const orFilter of filter.$or ?? [])
		groups.push(planFilterToGroups(orFilter)[0]);

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

function inferCustomerIdOperator(
	matcher: StringMatcher | undefined,
	count: number,
): FilterOperator {
	if (matcher && typeof matcher === "object") {
		if ("$nin" in matcher) return "not_in";
		if ("$ne" in matcher) return "is_not";
		if ("$in" in matcher) return "in";
	}
	return count > 1 ? "in" : "is";
}

function ruleToCustomerIdMatcher(rule: FilterRule): StringMatcher | undefined {
	if (rule.values.length === 0) return undefined;
	switch (rule.operator) {
		case "is":
			return rule.values[0];
		case "is_not":
			return { $ne: rule.values[0] };
		case "in":
			return { $in: rule.values };
		case "not_in":
			return { $nin: rule.values };
		default:
			return stringsToCustomerId(rule.values);
	}
}
