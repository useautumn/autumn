import type {
	CreditDimension,
	CreditMultiplier,
	CreditSchemaItem,
} from "@autumn/shared";
import { isEmptyObject } from "@autumn/shared";

/**
 * The dashboard edits dimensions as fields → values → rules: every rate or
 * multiplier is one rule whose match picks a value for some of the fields
 * (unset = any), named from its match.
 */

export type CreditMatch = Record<string, string>;
export type CreditRateRule = { name: string; dimension: CreditDimension };
export type CreditMultiplierRule = {
	name: string;
	multiplier: CreditMultiplier;
};
export type DimensionValues = Record<string, string[]>;

type Matched = { match: CreditMatch };

const matchesOf = (item: CreditSchemaItem): CreditMatch[] =>
	[
		...Object.values(item.dimensions ?? {}),
		...Object.values(item.multipliers ?? {}),
	].map((rule) => rule.match);

const unique = (values: string[]) => Array.from(new Set(values));

/** Every field and value referenced by a rate or multiplier, in first-seen order. */
export const dimensionValues = (item: CreditSchemaItem): DimensionValues => {
	const values: DimensionValues = {};
	for (const match of matchesOf(item)) {
		for (const [field, value] of Object.entries(match)) {
			values[field] = unique([...(values[field] ?? []), value]);
		}
	}
	return values;
};

export const mergeDimensionValues = (
	...maps: DimensionValues[]
): DimensionValues => {
	const fields = unique(maps.flatMap((map) => Object.keys(map)));
	return Object.fromEntries(
		fields.map((field) => [
			field,
			unique(maps.flatMap((map) => map[field] ?? [])),
		]),
	);
};

export const rateRules = (item: CreditSchemaItem): CreditRateRule[] =>
	Object.entries(item.dimensions ?? {}).map(([name, dimension]) => ({
		name,
		dimension,
	}));

export const multiplierRules = (
	item: CreditSchemaItem,
): CreditMultiplierRule[] =>
	Object.entries(item.multipliers ?? {}).map(([name, multiplier]) => ({
		name,
		multiplier,
	}));

const ruleName = (match: CreditMatch) =>
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

const namedByMatch = <T extends Matched>(rules: T[]): Record<string, T> => {
	const taken = new Set<string>();
	return Object.fromEntries(
		rules.map((rule) => [uniqueName(ruleName(rule.match), taken), rule]),
	);
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
	return {
		...rest,
		dimensions: namedByMatch(rules.map(({ dimension }) => dimension)),
	};
};

export const withMultiplierRules = ({
	item,
	rules,
}: {
	item: CreditSchemaItem;
	rules: CreditMultiplierRule[];
}): CreditSchemaItem => {
	const { multipliers: _multipliers, ...rest } = item;
	if (rules.length === 0) return rest;
	return {
		...rest,
		multipliers: namedByMatch(rules.map(({ multiplier }) => multiplier)),
	};
};

const isMatchAllowed = (match: CreditMatch, allowed: DimensionValues) =>
	Object.entries(match).every(([field, value]) =>
		allowed[field]?.includes(value),
	);

const onlyAllowed = <T extends Matched>(
	rules: Record<string, T> | undefined,
	allowed: DimensionValues,
): Record<string, T> =>
	Object.fromEntries(
		Object.entries(rules ?? {}).filter(([, rule]) =>
			isMatchAllowed(rule.match, allowed),
		),
	);

/** Removing a field or value drops every rate and multiplier that matched on it. */
export const withAllowedValues = ({
	item,
	allowed,
}: {
	item: CreditSchemaItem;
	allowed: DimensionValues;
}): CreditSchemaItem => {
	const dimensions = onlyAllowed(item.dimensions, allowed);
	const multipliers = onlyAllowed(item.multipliers, allowed);
	return {
		...withoutDimensions(item),
		...(isEmptyObject(dimensions) ? {} : { dimensions }),
		...(isEmptyObject(multipliers) ? {} : { multipliers }),
	};
};

export const withoutDimensions = (item: CreditSchemaItem): CreditSchemaItem => {
	const { dimensions: _dimensions, multipliers: _multipliers, ...rest } = item;
	return rest;
};

export const createRateRule = (): CreditRateRule => ({
	name: "",
	dimension: { match: {}, credit_amount: 0 },
});

export const createMultiplierRule = (): CreditMultiplierRule => ({
	name: "",
	multiplier: { match: {}, factor: 1 },
});

/** An unset cell means "any value" for that field. */
export const setMatchValue = ({
	match,
	field,
	value,
}: {
	match: CreditMatch;
	field: string;
	value: string | undefined;
}): CreditMatch => {
	const { [field]: _current, ...others } = match;
	return value === undefined ? others : { ...others, [field]: value };
};
