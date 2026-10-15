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

/** Each number operator's opposite; the map is its own inverse. */
export const NEGATED_NUMBER_OPERATORS: Record<string, string> = {
	eq: "ne",
	ne: "eq",
	lt: "gte",
	lte: "gt",
	gt: "lte",
	gte: "lt",
};

/** Caps (<, ≤) on something optional also pass when it's absent. */
export const isCapOperator = (operator: string) =>
	operator === "lt" || operator === "lte";

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

/**
 * Version-less choices fit one `$in`; a pinned version needs a branch per choice.
 * Null when the picker has no valid choice yet.
 */
export const toPlanFilter = (value: unknown) => {
	if (!Array.isArray(value)) {
		return isPlanSelection(value) ? toSelection(value) : null;
	}
	if (value.length === 0 || !value.every(isPlanSelection)) return null;
	if (value.every((selection) => selection.version === undefined)) {
		return { plan_id: { $in: value.map((selection) => selection.plan_id) } };
	}
	return { $or: value.map(toSelection) };
};

export const isPlanBranches = (branches: unknown) =>
	Array.isArray(branches) &&
	branches.every((branch) => isPlainObject(branch) && "plan_id" in branch);

/** Every plan choice a filter holds: one plan (`plan_id`), or several (`$in` / `$or`). */
export const planSelectionsOf = (
	filter: unknown,
): (PlanSelection | PlanSelection[])[] => {
	if (!isPlainObject(filter)) return [];
	const { plan_id: planId, $or: branches } = filter;
	const ids =
		isPlainObject(planId) && Array.isArray(planId.$in) ? planId.$in : null;
	return [
		...(typeof planId === "string"
			? [toSelection(filter as PlanSelection)]
			: []),
		...(ids ? [ids.map((id: string) => ({ plan_id: id }))] : []),
		...(isPlanBranches(branches)
			? [(branches as PlanSelection[]).map(toSelection)]
			: []),
	];
};

export const fromPlanFilter = (filter: unknown) =>
	planSelectionsOf(filter)[0] ?? null;

// `{}` is a value ("has no plan"), not a container to merge into.
const isMergeable = (value: unknown): value is Filter =>
	isPlainObject(value) && !isEmptyObject(value);

/** `{ a: { b: leaf } }` from `["a", "b"]`. */
export const at = (path: string[], leaf: unknown): Filter =>
	path.reduceRight<unknown>((inner, key) => ({ [key]: inner }), leaf) as Filter;

export const get = (value: unknown, path: string[]) =>
	path.reduce<unknown>(
		(inner, key) => (isPlainObject(inner) ? inner[key] : undefined),
		value,
	);

const setAt = (value: Filter, path: string[], leaf: unknown): Filter => {
	const [key, ...rest] = path;
	const inner =
		rest.length > 0 ? setAt(value[key] as Filter, rest, leaf) : leaf;
	return { ...value, [key]: inner };
};

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
		} else if (isMergeable(current) && isMergeable(value)) {
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
 * Merges one row's filter into its group's; null when both set the same leaf.
 * A row that collides inside the element at `andPath` is kept whole as an `$and` entry.
 */
export const mergeFilters = ({
	base,
	addition,
	andPath,
}: {
	base: Filter;
	addition: Filter;
	andPath: string[];
}): Filter | null => {
	const merged = deepMerge({ base, addition });
	if (merged) return merged;
	const element = get(addition, andPath);
	if (!isSameFilter(at(andPath, element), addition)) return null;
	const current = get(base, andPath) as Filter;
	const entries = Array.isArray(current.$and) ? current.$and : [];
	return setAt(base, andPath, { ...current, $and: [...entries, element] });
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
