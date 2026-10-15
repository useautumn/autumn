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

export const toPlanFilter = (value: unknown) =>
	toSelection(value as PlanSelection);

export const fromPlanFilter = (filter: unknown): PlanSelection | null =>
	isPlainObject(filter) && typeof filter.plan_id === "string"
		? toSelection(filter as PlanSelection)
		: null;

// `{}` is a value ("has no plan"), not a container to merge into.
const isMergeable = (value: unknown): value is Filter =>
	isPlainObject(value) && !isEmptyObject(value);

/** Deep-merges one row's filter into its group's; null when both set the same leaf. */
export const mergeFilters = ({
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
		} else if (isMergeable(current) && isMergeable(value)) {
			const inner = mergeFilters({ base: current, addition: value });
			if (!inner) return null;
			merged[key] = inner;
		} else {
			return null;
		}
	}
	return merged;
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
