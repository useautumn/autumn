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

/** Version-less choices fit one `$in`; a pinned version needs a branch per choice. */
export const toPlanFilter = (value: unknown) => {
	if (!Array.isArray(value)) return toSelection(value as PlanSelection);
	if (value.every((selection) => selection.version === undefined)) {
		return { plan_id: { $in: value.map((selection) => selection.plan_id) } };
	}
	return { $or: value.map(toSelection) };
};

export const isPlanBranches = (branches: unknown) =>
	Array.isArray(branches) &&
	branches.every((branch) => isPlainObject(branch) && "plan_id" in branch);

export const fromPlanFilter = (
	filter: unknown,
): PlanSelection | PlanSelection[] | null => {
	if (!isPlainObject(filter)) return null;
	const { plan_id: planId, $or: branches } = filter;
	if (typeof planId === "string") return toSelection(filter as PlanSelection);
	if (isPlainObject(planId) && Array.isArray(planId.$in)) {
		return planId.$in.map((id: string) => ({ plan_id: id }));
	}
	if (isPlanBranches(branches))
		return (branches as PlanSelection[]).map(toSelection);
	return null;
};

// `{}` is a value ("has no plan"), not a container to merge into.
const isMergeable = (value: unknown): value is Filter =>
	isPlainObject(value) && !isEmptyObject(value);

const andEntriesOf = (filter: Filter) =>
	Array.isArray(filter.$and) ? (filter.$and as Filter[]) : [];

const isSamePath = (a: string[], b: string[]) =>
	a.length === b.length && a.every((key, index) => key === b[index]);

/**
 * Deep-merges one row's filter into its group's; null when both set the same leaf.
 * Inside the element at `andPath`, colliding conditions become separate `$and` entries.
 */
export const mergeFilters = ({
	base,
	addition,
	andPath,
	path = [],
}: {
	base: Filter;
	addition: Filter;
	andPath: string[];
	path?: string[];
}): Filter | null => {
	let merged = { ...base };
	const isAndElement = isSamePath(path, andPath);
	for (const [key, value] of Object.entries(addition)) {
		const current = merged[key];
		const entries = andEntriesOf(merged);
		if (isAndElement && entries.some((entry) => key in entry)) {
			merged.$and = [...entries, { [key]: value }];
			continue;
		}
		if (!(key in merged)) {
			merged[key] = value;
			continue;
		}
		const inner =
			isMergeable(current) && isMergeable(value)
				? mergeFilters({
						base: current,
						addition: value,
						andPath,
						path: [...path, key],
					})
				: null;
		if (inner) {
			merged[key] = inner;
			continue;
		}
		if (!isAndElement) return null;
		const { [key]: _moved, ...rest } = merged;
		merged = {
			...rest,
			$and: [...entries, { [key]: current }, { [key]: value }],
		};
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
