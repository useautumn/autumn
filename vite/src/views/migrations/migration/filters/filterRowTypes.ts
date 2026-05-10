import type { PlanFilter, StringMatcher } from "@autumn/shared";

export type FilterField =
	| "plan_id"
	| "paid"
	| "recurring"
	| "price"
	| "item_feature_id"
	| "item_unlimited"
	| "item_price";

export type FilterOperator =
	| "is"
	| "is_not"
	| "in"
	| "regex"
	| "starts_with"
	| "exists"
	| "not_exists";

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
	{ value: "plan_id", label: "Plan ID" },
	{ value: "paid", label: "Paid" },
	{ value: "recurring", label: "Recurring" },
	{ value: "price", label: "Base Price" },
	{ value: "item_feature_id", label: "Item Feature" },
	{ value: "item_unlimited", label: "Item Unlimited" },
	{ value: "item_price", label: "Item Price" },
];

type OperatorOption = { value: FilterOperator; label: string };
type FieldConfig = {
	operators: OperatorOption[];
	valueType: "string" | "boolean" | "none";
};

const STRING_OPERATORS: OperatorOption[] = [
	{ value: "is", label: "is" },
	{ value: "is_not", label: "is not" },
	{ value: "in", label: "in" },
	{ value: "regex", label: "regex" },
	{ value: "starts_with", label: "starts with" },
];

const STRING_MATCH_OPERATORS: OperatorOption[] = [
	{ value: "is", label: "is" },
	{ value: "is_not", label: "is not" },
	{ value: "in", label: "in" },
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
	plan_id: { operators: STRING_OPERATORS, valueType: "string" },
	paid: BOOLEAN_ONLY,
	recurring: BOOLEAN_ONLY,
	price: NULLABLE_ONLY,
	item_feature_id: { operators: STRING_MATCH_OPERATORS, valueType: "string" },
	item_unlimited: BOOLEAN_ONLY,
	item_price: NULLABLE_ONLY,
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

function ruleToStringMatcher(rule: FilterRule): StringMatcher {
	if (rule.values.length > 1) return { $in: rule.values };

	const val = rule.values[0];
	switch (rule.operator) {
		case "is":
			return val ?? "";
		case "is_not":
			return { $ne: val ?? "" };
		case "in":
			return { $in: rule.values };
		case "regex":
			return { $regex: val ?? "" };
		case "starts_with":
			return { $startsWith: val ?? "" };
	}
}

function booleanRule(field: FilterField, value: boolean): FilterRule {
	return { field, operator: "is", values: [String(value)] };
}

function nullableToRule(field: FilterField, value: unknown): FilterRule | null {
	if (value === undefined) return null;
	if (value === null) return { field, operator: "not_exists", values: [] };
	return {
		field,
		operator:
			typeof value === "object" && "$ne" in (value as object)
				? "exists"
				: "exists",
		values: [],
	};
}

function resolveArrayFilterInner(item: Record<string, unknown>): unknown {
	for (const key of ["$some", "$every", "$none"] as const) {
		if (key in item) return item[key];
	}
	return item;
}

export function planFilterToGroups(filter: PlanFilter): FilterGroupData[] {
	const mainRules: FilterRule[] = [];

	const planIdRule = stringMatcherToRule("plan_id", filter.plan_id);
	if (planIdRule) mainRules.push(planIdRule);

	if (filter.paid !== undefined)
		mainRules.push(booleanRule("paid", filter.paid));

	if (filter.recurring !== undefined)
		mainRules.push(booleanRule("recurring", filter.recurring));

	const priceRule = nullableToRule("price", filter.price);
	if (priceRule) mainRules.push(priceRule);

	if (filter.item !== undefined) {
		const item =
			typeof filter.item === "object" && filter.item !== null
				? filter.item
				: {};
		const inner = resolveArrayFilterInner(item as Record<string, unknown>);

		if (inner && typeof inner === "object") {
			const typedInner = inner as Record<string, unknown>;

			const featureRule = stringMatcherToRule(
				"item_feature_id",
				typedInner.feature_id as StringMatcher | undefined,
			);
			if (featureRule) mainRules.push(featureRule);

			if (typedInner.unlimited !== undefined)
				mainRules.push(
					booleanRule("item_unlimited", Boolean(typedInner.unlimited)),
				);

			const itemPriceRule = nullableToRule("item_price", typedInner.price);
			if (itemPriceRule) mainRules.push(itemPriceRule);
		}
	}

	const groups: FilterGroupData[] = [{ rules: mainRules }];

	if (filter.$or) {
		for (const orFilter of filter.$or) {
			const orGroups = planFilterToGroups(orFilter);
			if (orGroups.length > 0) groups.push(orGroups[0]);
		}
	}

	return groups;
}

export function groupsToPlanFilter(groups: FilterGroupData[]): PlanFilter {
	const main = groups[0];
	if (!main) return {};

	const filter: PlanFilter = {};
	let hasItemFields = false;
	const itemInner: Record<string, unknown> = {};

	for (const rule of main.rules) {
		switch (rule.field) {
			case "plan_id":
				filter.plan_id = ruleToStringMatcher(rule);
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
				hasItemFields = true;
				itemInner.feature_id = ruleToStringMatcher(rule);
				break;
			case "item_unlimited":
				hasItemFields = true;
				itemInner.unlimited = rule.values[0] === "true";
				break;
			case "item_price":
				hasItemFields = true;
				itemInner.price = rule.operator === "exists" ? { $ne: null } : null;
				break;
		}
	}

	if (hasItemFields) filter.item = itemInner as PlanFilter["item"];

	if (groups.length > 1) {
		filter.$or = groups.slice(1).map((group) => groupsToPlanFilter([group]));
	}

	return filter;
}
