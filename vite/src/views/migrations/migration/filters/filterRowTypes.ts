import type { NumberMatcher, PlanFilter, StringMatcher } from "@autumn/shared";

export type FilterField =
	| "customer_id"
	| "plan_id"
	| "version"
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
	| "none"
	| "gt"
	| "gte"
	| "lt"
	| "lte";

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
	{ value: "version", label: "Version" },
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
	valueType: "string" | "boolean" | "number" | "none";
};

const STRING_OPERATORS: OperatorOption[] = [
	{ value: "is", label: "is" },
	{ value: "is_not", label: "is not" },
	{ value: "in", label: "in" },
	{ value: "not_in", label: "not in" },
	{ value: "regex", label: "regex" },
	{ value: "starts_with", label: "starts with" },
];

// Plan adds "has none" — selects customers with no active plans at all
// (compiles to the `$none` quantifier, not a per-plan matcher).
const PLAN_OPERATORS: OperatorOption[] = [
	...STRING_OPERATORS,
	{ value: "none", label: "has none" },
];

const STRING_MATCH_OPERATORS: OperatorOption[] = [
	{ value: "is", label: "is" },
	{ value: "is_not", label: "is not" },
	{ value: "in", label: "in" },
	{ value: "not_in", label: "not in" },
];

const NUMBER_OPERATORS: OperatorOption[] = [
	{ value: "is", label: "is" },
	{ value: "is_not", label: "is not" },
	{ value: "gt", label: ">" },
	{ value: "gte", label: "≥" },
	{ value: "lt", label: "<" },
	{ value: "lte", label: "≤" },
	{ value: "in", label: "in" },
	{ value: "not_in", label: "not in" },
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
	plan_id: { operators: PLAN_OPERATORS, valueType: "string" },
	version: { operators: NUMBER_OPERATORS, valueType: "number" },
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

/**
 * Convert a NumberMatcher to one OR MORE FilterRules. A combined matcher like
 * `{ $gte: 2, $lte: 4 }` emits two rules (a "≥ 2" rule and a "≤ 4" rule) so
 * neither constraint is silently dropped. `groupsToPlanFilter` re-merges them
 * by field on save.
 */
export function numberMatcherToRules(
	field: FilterField,
	matcher: NumberMatcher | undefined,
): FilterRule[] {
	if (matcher === undefined) return [];
	if (matcher === null) return [{ field, operator: "is", values: [] }];
	if (typeof matcher === "number")
		return [{ field, operator: "is", values: [String(matcher)] }];

	const rules: FilterRule[] = [];
	if (matcher.$eq !== undefined) {
		if (matcher.$eq === null) rules.push({ field, operator: "is", values: [] });
		else rules.push({ field, operator: "is", values: [String(matcher.$eq)] });
	}
	if (matcher.$ne !== undefined && matcher.$ne !== null)
		rules.push({ field, operator: "is_not", values: [String(matcher.$ne)] });
	if (matcher.$in !== undefined)
		rules.push({ field, operator: "in", values: matcher.$in.map(String) });
	if (matcher.$nin !== undefined)
		rules.push({ field, operator: "not_in", values: matcher.$nin.map(String) });
	if (matcher.$gt !== undefined)
		rules.push({ field, operator: "gt", values: [String(matcher.$gt)] });
	if (matcher.$gte !== undefined)
		rules.push({ field, operator: "gte", values: [String(matcher.$gte)] });
	if (matcher.$lt !== undefined)
		rules.push({ field, operator: "lt", values: [String(matcher.$lt)] });
	if (matcher.$lte !== undefined)
		rules.push({ field, operator: "lte", values: [String(matcher.$lte)] });
	return rules;
}

/**
 * Convert a single FilterRule into a NumberMatcher fragment that can be
 * merged with other fragments for the same field. An empty `"is"` rule round-
 * trips from `version: null` and must preserve the explicit null match.
 */
function ruleToNumberMatcherFragment(
	rule: FilterRule,
): Record<string, unknown> | null {
	const nums = rule.values
		.map((v) => Number.parseFloat(v))
		.filter((n) => !Number.isNaN(n));
	if (nums.length === 0) {
		if (rule.operator === "is") return { $eq: null };
		return null;
	}
	const first = nums[0];
	switch (rule.operator) {
		case "is":
			return nums.length > 1 ? { $in: nums } : { $eq: first };
		case "is_not":
			return { $ne: first };
		case "in":
			return { $in: nums };
		case "not_in":
			return { $nin: nums };
		case "gt":
			return { $gt: first };
		case "gte":
			return { $gte: first };
		case "lt":
			return { $lt: first };
		case "lte":
			return { $lte: first };
		default:
			return { $eq: first };
	}
}

export function mergeNumberFragments(
	fragments: Record<string, unknown>[],
): NumberMatcher | undefined {
	if (fragments.length === 0) return undefined;
	if (fragments.length === 1) {
		const fragment = fragments[0];
		const keys = Object.keys(fragment);
		if (keys.length === 1 && "$eq" in fragment) {
			// Simplify single-eq fragments back to bare value (matches the
			// canonical "bare = $eq" convention) — handles version: 1 → 1
			// and version: null → null.
			return fragment.$eq as NumberMatcher;
		}
		return fragment as NumberMatcher;
	}
	return Object.assign({}, ...fragments) as NumberMatcher;
}

function ruleToStringMatcher(rule: FilterRule): StringMatcher {
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

export function planFilterToGroups(filter: PlanFilter): FilterGroupData[] {
	const mainRules: FilterRule[] = [];

	const planIdRule = stringMatcherToRule("plan_id", filter.plan_id);
	if (planIdRule) mainRules.push(planIdRule);

	mainRules.push(...numberMatcherToRules("version", filter.version));

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

	if (filter.$or) {
		for (const orFilter of filter.$or) {
			const orGroups = planFilterToGroups(orFilter);
			if (orGroups.length > 0) groups.push(orGroups[0]);
		}
	}

	return groups.length > 0 ? groups : [{ rules: [] }];
}

function groupToPlanFilter(group: FilterGroupData): PlanFilter {
	const filter: PlanFilter = {};
	let hasItemFields = false;
	const itemInner: Record<string, unknown> = {};
	const versionFragments: Record<string, unknown>[] = [];
	const hasStringValue = (rule: FilterRule) =>
		rule.values.some((value) => value.trim().length > 0);

	for (const rule of group.rules) {
		switch (rule.field) {
			case "plan_id":
				if (!hasStringValue(rule)) break;
				filter.plan_id = ruleToStringMatcher(rule);
				break;
			case "version": {
				const fragment = ruleToNumberMatcherFragment(rule);
				if (fragment) versionFragments.push(fragment);
				break;
			}
			case "custom":
				filter.custom = rule.values[0] === "true";
				break;
			case "paid":
				filter.paid = rule.values[0] === "true";
				break;
			case "recurring":
				filter.recurring = rule.values[0] === "true";
				break;
			case "price":
				filter.price = rule.operator === "exists" ? { $ne: null } : null;
				break;
			case "item_feature_id":
				if (!hasStringValue(rule)) break;
				hasItemFields = true;
				itemInner.feature_id = ruleToStringMatcher(rule);
				break;
			case "item_unlimited":
				hasItemFields = true;
				itemInner.unlimited = rule.values[0] === "true";
				break;
		}
	}

	if (hasItemFields) {
		filter.item = itemInner as PlanFilter["item"];
	}

	const versionMatcher = mergeNumberFragments(versionFragments);
	if (versionMatcher !== undefined) filter.version = versionMatcher;

	return filter;
}

export function groupsToPlanFilter(groups: FilterGroupData[]): PlanFilter {
	const branches = groups
		.map(groupToPlanFilter)
		.filter((filter) => Object.keys(filter).length > 0);

	if (branches.length === 0) return {};
	if (branches.length === 1) return branches[0];
	return { $or: branches };
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
