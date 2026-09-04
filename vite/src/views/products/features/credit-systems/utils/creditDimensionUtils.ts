import type {
	CreditDimension,
	CreditMultiplier,
	CreditSchemaItem,
} from "@autumn/shared";
import {
	CREDIT_DIMENSION_NAME_MAX_LENGTH,
	isEmptyObject,
	mapRecordValues,
} from "@autumn/shared";

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
		.slice(0, CREDIT_DIMENSION_NAME_MAX_LENGTH) || "rule";

/**
 * Duplicate matches collapse to one name, so names are made unique by suffix —
 * trimming the stem first, since the whole key must stay within the API limit.
 */
const uniqueName = (name: string, taken: Set<string>) => {
	let candidate = name;
	let index = 2;
	while (taken.has(candidate)) {
		const suffix = `_${index++}`;
		candidate = `${name.slice(0, CREDIT_DIMENSION_NAME_MAX_LENGTH - suffix.length)}${suffix}`;
	}
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

export const isMatchAllowed = (match: CreditMatch, allowed: DimensionValues) =>
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

export const createMultiplierRule = (): CreditMultiplierRule => ({
	name: "",
	multiplier: { match: {}, factor: 1 },
});

/** An unset cell means "any value" for that field. */
const renameMatchKey = ({
	match,
	from,
	to,
}: {
	match: CreditMatch;
	from: string;
	to: string;
}): CreditMatch =>
	Object.fromEntries(
		Object.entries(match).map(([key, value]) => [
			key === from ? to : key,
			value,
		]),
	);

/** Renaming a dimension rewrites the key in every rate and multiplier that matched on it. */
export const withRenamedField = ({
	item,
	from,
	to,
}: {
	item: CreditSchemaItem;
	from: string;
	to: string;
}): CreditSchemaItem => {
	const rename = <T extends Matched>(rules: Record<string, T> | undefined) =>
		mapRecordValues({
			record: rules ?? {},
			mapValue: (rule) => ({
				...rule,
				match: renameMatchKey({ match: rule.match, from, to }),
			}),
		});

	// Names are derived from the match, so renaming a field renames the rules too.
	const renamed = {
		...item,
		...(item.dimensions ? { dimensions: rename(item.dimensions) } : {}),
		...(item.multipliers ? { multipliers: rename(item.multipliers) } : {}),
	};

	const withRates = withRateRules({
		item: renamed,
		rules: rateRules(renamed),
	});
	return withMultiplierRules({
		item: withRates,
		rules: multiplierRules(renamed),
	});
};

export const renameDimensionValuesKey = ({
	values,
	from,
	to,
}: {
	values: DimensionValues;
	from: string;
	to: string;
}): DimensionValues =>
	Object.fromEntries(
		Object.entries(values).map(([field, list]) => [
			field === from ? to : field,
			list,
		]),
	);

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

/** A row of the rates table: a saved rule, or a draft that only has its match so far. */
/**
 * A row in the rates table. `key` is its identity for React and the table: rows
 * are reassembled from the item on every render, and every content-derived id
 * (index, name, match) collides or changes as the row is edited.
 */
export type CreditRateRow = {
	key: string;
	name: string;
	match: CreditMatch;
	dimension?: CreditDimension;
};

/** A draft row is only a match until a cost is typed, so it carries its own key. */
export type CreditRateDraft = { key: string; match: CreditMatch };

export const createRateDraft = (match: CreditMatch = {}): CreditRateDraft => ({
	key: crypto.randomUUID(),
	match,
});

/**
 * The names these rows will be saved under, so a caller can carry a row's key
 * across the draft-to-rule transition before the item is rebuilt.
 */
export const nameRateRows = (rows: CreditRateRow[]): CreditRateRow[] => {
	const taken = new Set<string>();
	return rows.map((row) =>
		row.dimension
			? { ...row, name: uniqueName(ruleName(row.match), taken) }
			: row,
	);
};

export const rateRowsOf = ({
	rules,
	drafts,
	keysByRuleName,
}: {
	rules: CreditRateRule[];
	drafts: CreditRateDraft[];
	/** Keys claimed by a row before it was saved, so it keeps its identity. */
	keysByRuleName?: Map<string, string>;
}): CreditRateRow[] => [
	...rules.map(({ name, dimension }) => ({
		key: keysByRuleName?.get(name) ?? `rule:${name}`,
		name,
		match: dimension.match,
		dimension,
	})),
	...drafts.map(({ key, match }) => ({ key, name: "", match })),
];

export const rulesOf = (rows: CreditRateRow[]): CreditRateRule[] =>
	rows.flatMap((row) =>
		row.dimension ? [{ name: row.name, dimension: row.dimension }] : [],
	);

export const draftsOf = (rows: CreditRateRow[]): CreditRateDraft[] =>
	rows.flatMap((row) =>
		row.dimension ? [] : [{ key: row.key, match: row.match }],
	);

export const withRateCredits = ({
	row,
	credits,
}: {
	row: CreditRateRow;
	credits: number | undefined;
}): CreditRateRow => {
	if (credits === undefined)
		return { key: row.key, name: row.name, match: row.match };
	const dimension =
		row.dimension?.tier_behavior === "graduated"
			? row.dimension
			: { ...row.dimension, match: row.match, credit_amount: credits };
	return { ...row, dimension };
};

export const withRateMatch = ({
	row,
	match,
}: {
	row: CreditRateRow;
	match: CreditMatch;
}): CreditRateRow => ({
	...row,
	match,
	...(row.dimension ? { dimension: { ...row.dimension, match } } : {}),
});

const specificity = (match: CreditMatch) => Object.keys(match).length;

// Mirrors the server resolver: an omitted priority ranks below an explicit 0.
const priorityRank = (dimension: CreditDimension) =>
	dimension.priority ?? Number.NEGATIVE_INFINITY;

const sameMatch = (left: CreditMatch, right: CreditMatch) =>
	specificity(left) === specificity(right) &&
	Object.entries(left).every(([key, value]) => right[key] === value);

const covers = (partial: CreditMatch, full: CreditMatch) =>
	Object.entries(partial).every(([key, value]) => full[key] === value);

/** The saved rule that would price this match at runtime: the most specific one covering it. */
export const coveringRule = ({
	rules,
	match,
}: {
	rules: CreditRateRule[];
	match: CreditMatch;
}): CreditRateRule | undefined =>
	rules
		.filter((rule) => covers(rule.dimension.match, match))
		.sort(
			(left, right) =>
				specificity(right.dimension.match) -
					specificity(left.dimension.match) ||
				priorityRank(right.dimension) - priorityRank(left.dimension) ||
				left.name.localeCompare(right.name),
		)[0];

export const MAX_FILLED_COMBINATIONS = 100;

const cartesian = (lists: string[][]): string[][] =>
	lists.reduce<string[][]>(
		(combos, list) => combos.flatMap((combo) => list.map((v) => [...combo, v])),
		[[]],
	);

const fullCombinations = (values: DimensionValues): CreditMatch[] => {
	const fields = Object.keys(values).filter(
		(field) => values[field].length > 0,
	);
	if (fields.length === 0) return [];
	return cartesian(fields.map((field) => values[field])).map((combo) =>
		Object.fromEntries(fields.map((field, i) => [field, combo[i]])),
	);
};

/** Counted from the grid size rather than the grid: a wide product would freeze the editor. */
export const missingCombinationCount = ({
	values,
	rows,
}: {
	values: DimensionValues;
	rows: CreditRateRow[];
}): number => {
	const fields = Object.keys(values).filter(
		(field) => values[field].length > 0,
	);
	if (fields.length === 0) return 0;

	const total = fields.reduce(
		(product, field) => product * values[field].length,
		1,
	);
	if (total > MAX_FILLED_COMBINATIONS) return total;

	return fullCombinations(values).filter(
		(match) => !rows.some((row) => sameMatch(row.match, match)),
	).length;
};

/**
 * One row per full combination: exact rows stay, combinations under a partial
 * rule inherit its rate, the rest become drafts. Partial rows are folded into
 * the grid and dropped, so the table never mixes both.
 */
export const filledRateRows = ({
	values,
	rows,
}: {
	values: DimensionValues;
	rows: CreditRateRow[];
}): CreditRateRow[] => {
	const rules = rulesOf(rows);
	return fullCombinations(values).map((match) => {
		const exact = rows.find((row) => sameMatch(row.match, match));
		if (exact) return exact;
		const seed = coveringRule({ rules, match });
		const key = crypto.randomUUID();
		return seed
			? { key, name: "", match, dimension: { ...seed.dimension, match } }
			: { key, name: "", match };
	});
};
