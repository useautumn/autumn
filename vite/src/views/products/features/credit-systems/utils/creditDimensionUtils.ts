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

export type CreditMatch = Record<string, string>;
export type CreditRateRule = { name: string; dimension: CreditDimension };
export type CreditMultiplierRule = {
	name: string;
	multiplier: CreditMultiplier;
};
export type DimensionValues = Record<string, string[]>;

type MatchableRule = { match: CreditMatch };

const matchesFromRatesAndMultipliers = (
	item: CreditSchemaItem,
): CreditMatch[] =>
	[
		...Object.values(item.dimensions ?? {}),
		...Object.values(item.multipliers ?? {}),
	].map((rule) => rule.match);

const unique = (values: string[]) => Array.from(new Set(values));

export const dimensionValues = (item: CreditSchemaItem): DimensionValues => {
	const values: DimensionValues = {};
	for (const match of matchesFromRatesAndMultipliers(item)) {
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

const namedByMatch = <T extends MatchableRule>(
	rules: T[],
): Record<string, T> => {
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

const onlyAllowed = <T extends MatchableRule>(
	rules: Record<string, T> | undefined,
	allowed: DimensionValues,
): Record<string, T> =>
	Object.fromEntries(
		Object.entries(rules ?? {}).filter(([, rule]) =>
			isMatchAllowed(rule.match, allowed),
		),
	);

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

export const withRenamedField = ({
	item,
	from,
	to,
}: {
	item: CreditSchemaItem;
	from: string;
	to: string;
}): CreditSchemaItem => {
	const rename = <T extends MatchableRule>(
		rules: Record<string, T> | undefined,
	) =>
		mapRecordValues({
			record: rules ?? {},
			mapValue: (rule) => ({
				...rule,
				match: renameMatchKey({ match: rule.match, from, to }),
			}),
		});

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

export type CreditRateRow = {
	key: string;
	name: string;
	match: CreditMatch;
	dimension?: CreditDimension;
};

export type CreditRateDraft = { key: string; match: CreditMatch };

export const createRateDraft = (match: CreditMatch = {}): CreditRateDraft => ({
	key: crypto.randomUUID(),
	match,
});

export const nameRateRows = (rows: CreditRateRow[]): CreditRateRow[] => {
	const taken = new Set<string>();
	return rows.map((row) =>
		row.dimension
			? { ...row, name: uniqueName(ruleName(row.match), taken) }
			: row,
	);
};

const ruleRowKey = (name: string) => `rule:${name}`;

export const renamedRowOrder = ({
	order,
	item,
	from,
	to,
}: {
	order: string[];
	item: CreditSchemaItem;
	from: string;
	to: string;
}): string[] => {
	const renamedKey = new Map(
		rateRules(item).map(({ name, dimension }) => [
			ruleRowKey(name),
			ruleRowKey(
				ruleName(renameMatchKey({ match: dimension.match, from, to })),
			),
		]),
	);
	return order.map((key) => renamedKey.get(key) ?? key);
};

export const toRateRows = ({
	rules,
	drafts,
	keysByRuleName,
	order = [],
}: {
	rules: CreditRateRule[];
	drafts: CreditRateDraft[];
	keysByRuleName?: Map<string, string>;
	order?: string[];
}): CreditRateRow[] => {
	const rows: CreditRateRow[] = [
		...rules.map(({ name, dimension }) => ({
			key: keysByRuleName?.get(name) ?? ruleRowKey(name),
			name,
			match: dimension.match,
			dimension,
		})),
		...drafts.map(({ key, match }) => ({ key, name: "", match })),
	];

	const rank = new Map(order.map((key, index) => [key, index]));
	return rows.sort(
		(a, b) =>
			(rank.get(a.key) ?? order.length) - (rank.get(b.key) ?? order.length),
	);
};

export const savedRulesFrom = (rows: CreditRateRow[]): CreditRateRule[] =>
	rows.flatMap((row) =>
		row.dimension ? [{ name: row.name, dimension: row.dimension }] : [],
	);

export const draftsFrom = (rows: CreditRateRow[]): CreditRateDraft[] =>
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

export const withRatePriority = ({
	row,
	priority,
}: {
	row: CreditRateRow;
	priority: number | undefined;
}): CreditRateRow => {
	if (!row.dimension) return row;
	const { priority: _dropped, ...dimension } = row.dimension;
	return {
		...row,
		dimension:
			priority === undefined
				? (dimension as CreditDimension)
				: ({ ...dimension, priority } as CreditDimension),
	};
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

const priorityRank = (dimension: CreditDimension) =>
	dimension.priority ?? Number.NEGATIVE_INFINITY;

const sameMatch = (left: CreditMatch, right: CreditMatch) =>
	specificity(left) === specificity(right) &&
	Object.entries(left).every(([key, value]) => right[key] === value);

const covers = (partial: CreditMatch, full: CreditMatch) =>
	Object.entries(partial).every(([key, value]) => full[key] === value);

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

export const filledRateRows = ({
	values,
	rows,
}: {
	values: DimensionValues;
	rows: CreditRateRow[];
}): CreditRateRow[] => {
	const rules = savedRulesFrom(rows);
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
