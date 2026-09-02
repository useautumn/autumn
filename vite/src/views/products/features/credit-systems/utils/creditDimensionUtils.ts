import type { CreditDimension, CreditSchemaItem } from "@autumn/shared";
import { Infinite } from "@autumn/shared";

/**
 * The dashboard edits dimensions as fields → rates: the fields are the
 * property keys, every rate is one rule whose match holds a value for some of
 * those fields (blank = any), named from its match.
 */

export type CreditRateRule = { name: string; dimension: CreditDimension };

export const dimensionFields = (item: CreditSchemaItem): string[] =>
	Array.from(
		new Set(
			Object.values(item.dimensions ?? {}).flatMap((dimension) =>
				Object.keys(dimension.match),
			),
		),
	);

export const rateRules = (item: CreditSchemaItem): CreditRateRule[] =>
	Object.entries(item.dimensions ?? {}).map(([name, dimension]) => ({
		name,
		dimension,
	}));

const ruleName = (match: Record<string, string>) =>
	Object.entries(match)
		.map(([key, value]) => `${key}_${value}`)
		.join("_")
		.replace(/[^a-zA-Z0-9_]+/g, "_")
		.slice(0, 64) || "rule";

/** Duplicate matches collapse to one name, so names are made unique by suffix. */
const uniqueName = (name: string, taken: Set<string>) => {
	let candidate = name;
	let index = 2;
	while (taken.has(candidate)) candidate = `${name}_${index++}`;
	taken.add(candidate);
	return candidate;
};

export const withRateRules = ({
	item,
	rules,
}: {
	item: CreditSchemaItem;
	rules: CreditRateRule[];
}): CreditSchemaItem => {
	const { dimensions: _dimensions, ...rest } = item;
	if (rules.length === 0) return rest;
	const taken = new Set<string>();
	return {
		...rest,
		dimensions: Object.fromEntries(
			rules.map(({ dimension }) => [
				uniqueName(ruleName(dimension.match), taken),
				dimension,
			]),
		),
	};
};

/** Dropping a field removes it from every rule's match; rules left matching nothing are removed. */
export const withFields = ({
	item,
	fields,
}: {
	item: CreditSchemaItem;
	fields: string[];
}): CreditSchemaItem => {
	const keep = new Set(fields);
	const rules = rateRules(item)
		.map(({ name, dimension }) => ({
			name,
			dimension: {
				...dimension,
				match: Object.fromEntries(
					Object.entries(dimension.match).filter(([key]) => keep.has(key)),
				),
			},
		}))
		.filter(({ dimension }) => Object.keys(dimension.match).length > 0);
	return withRateRules({ item, rules });
};

export const withoutDimensions = (item: CreditSchemaItem): CreditSchemaItem => {
	const { dimensions: _dimensions, multipliers: _multipliers, ...rest } = item;
	return rest;
};

export const createRateRule = (): CreditRateRule => ({
	name: "",
	dimension: { match: {}, credit_amount: 0 },
});

/** A blank cell means "any value" for that field. */
export const setRuleCell = ({
	rule,
	field,
	value,
}: {
	rule: CreditRateRule;
	field: string;
	value: string;
}): CreditRateRule => {
	const { [field]: _current, ...others } = rule.dimension.match;
	const match = value.trim() === "" ? others : { ...others, [field]: value };
	return { ...rule, dimension: { ...rule.dimension, match } };
};

export const rateKindOf = (dimension: CreditDimension): "flat" | "tiered" =>
	dimension.tier_behavior === "graduated" ? "tiered" : "flat";

/** Flat and tiered forbid each other's cost fields, so the switch rebuilds the rate. */
export const setRateKind = ({
	dimension,
	kind,
}: {
	dimension: CreditDimension;
	kind: "flat" | "tiered";
}): CreditDimension => {
	if (kind === rateKindOf(dimension)) return dimension;
	const base = {
		match: dimension.match,
		...(dimension.priority === undefined
			? {}
			: { priority: dimension.priority }),
	};
	if (kind === "tiered") {
		return {
			...base,
			tier_behavior: "graduated",
			tiers: [{ to: Infinite, credit_amount: dimension.credit_amount ?? 0 }],
		};
	}
	return { ...base, credit_amount: dimension.tiers?.[0]?.credit_amount ?? 0 };
};
