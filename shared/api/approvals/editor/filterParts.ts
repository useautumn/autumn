import { isPlainObject } from "../schemas/isPlainObject";
import type { PlanSelection } from "./editorFields";

export type Filter = Record<string, unknown>;

/** A row's operator and value, before its field is attached. */
export type RowRead = { operator: string; value: unknown };

const MATCHER_KEYS: Record<string, string> = {
	is_not: "$ne",
	is_any_of: "$in",
	is_none_of: "$nin",
	ne: "$ne",
	lt: "$lt",
	lte: "$lte",
	gt: "$gt",
	gte: "$gte",
};

const STRING_OPERATORS: Record<string, string> = {
	$ne: "is_not",
	$in: "is_any_of",
	$nin: "is_none_of",
};

/** Mongo convention: equality ("is", "=") is the bare value. */
export const toMatcher = ({ operator, value }: RowRead) => {
	const key = MATCHER_KEYS[operator];
	return key ? { [key]: value } : value;
};

/** One read per matcher key, so a range reads back as two rows. */
export const fromStringMatcher = (matcher: unknown): RowRead[] =>
	typeof matcher === "string"
		? [{ operator: "is", value: matcher }]
		: entriesOf(matcher).map(([key, value]) => ({
				operator: STRING_OPERATORS[key] ?? key,
				value,
			}));

export const fromNumberMatcher = (matcher: unknown): RowRead[] =>
	typeof matcher === "number"
		? [{ operator: "eq", value: matcher }]
		: entriesOf(matcher).map(([key, value]) => ({
				operator: key.slice(1),
				value,
			}));

export const entriesOf = (value: unknown) =>
	isPlainObject(value) ? Object.entries(value) : [];

export const isEmptyObject = (value: unknown) =>
	isPlainObject(value) && Object.keys(value).length === 0;

const toSelection = ({ plan_id, version }: PlanSelection): PlanSelection =>
	version === undefined ? { plan_id } : { plan_id, version };

const isPlanSelection = (value: unknown): value is PlanSelection =>
	isPlainObject(value) &&
	typeof value.plan_id === "string" &&
	(value.version === undefined || typeof value.version === "number");

/** Null when the picker has no valid choice yet. */
export const toPlanFilter = (value: unknown) =>
	isPlanSelection(value) ? toSelection(value) : null;

export const fromPlanFilter = (filter: unknown): PlanSelection | null =>
	isPlainObject(filter) && typeof filter.plan_id === "string"
		? toSelection(filter as PlanSelection)
		: null;

// `{}` is a value ("has no plan"), not a container to merge into.
const isMergeable = (value: unknown): value is Filter =>
	isPlainObject(value) && !isEmptyObject(value);

// "Some plan is X" and "some plan is Y" aren't one plan that's both, and the same goes for none.
const EXISTENTIAL_QUANTIFIERS = ["$some", "$none"];

const deepMerge = ({
	base,
	addition,
}: {
	base: Filter;
	addition: Filter;
}): Filter | null => {
	const merged = { ...base };
	for (const [key, value] of Object.entries(addition)) {
		const current = merged[key];
		if (!(key in merged)) {
			merged[key] = value;
		} else if (
			isMergeable(current) &&
			isMergeable(value) &&
			!EXISTENTIAL_QUANTIFIERS.includes(key)
		) {
			const inner = deepMerge({ base: current, addition: value });
			if (!inner) return null;
			merged[key] = inner;
		} else {
			return null;
		}
	}
	return merged;
};

/**
 * Merges one row's filter into its group's. A row that sets something already
 * set is kept whole as an `$and` entry, so no condition is ever overwritten.
 */
export const mergeFilters = ({
	base,
	addition,
}: {
	base: Filter;
	addition: Filter;
}): Filter => {
	const merged = deepMerge({ base, addition });
	if (merged) return merged;
	const entries = Array.isArray(base.$and) ? base.$and : [];
	return { ...base, $and: [...entries, addition] };
};

/** A group's own conditions, then each `$and` entry, as filters to read rows from. */
export const andViewsOf = (group: Filter): Filter[] => {
	const { $and: entries, ...rest } = group;
	return [rest, ...(Array.isArray(entries) ? entries : [])];
};

export const isSameFilter = (a: unknown, b: unknown): boolean => {
	if (Array.isArray(a) || Array.isArray(b)) {
		return (
			Array.isArray(a) &&
			Array.isArray(b) &&
			a.length === b.length &&
			a.every((item, index) => isSameFilter(item, b[index]))
		);
	}
	if (isPlainObject(a) && isPlainObject(b)) {
		const keys = Object.keys(a);
		return (
			keys.length === Object.keys(b).length &&
			keys.every((key) => key in b && isSameFilter(a[key], b[key]))
		);
	}
	return a === b;
};
