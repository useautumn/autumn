import { isPlainObject } from "../../schemas/isPlainObject";
import { buildUnsupportedMatch } from "./buildUnsupportedMatch";
import type {
	FilterFields,
	FilterMatch,
	FilterMatchContext,
} from "./filterFieldTypes";
import { joinFieldPath } from "./joinFieldPath";
import { matchAll } from "./matchAll";
import { matchAny } from "./matchAny";

type MatchFilterArgs<Parent> = {
	filter: unknown;
	parent: Parent;
	fields: FilterFields<Parent>;
	path: string;
	context: FilterMatchContext;
};

/**
 * Keys are ANDed; `$and` adds up its branches, `$or` reports its first matching
 * branch. An unknown key or an empty group is unsupported, never a quiet no-match.
 */
export const matchFilter = <Parent>({
	filter,
	parent,
	fields,
	path,
	context,
}: MatchFilterArgs<Parent>): FilterMatch => {
	if (!isPlainObject(filter)) return buildUnsupportedMatch({ field: path });

	const entries = Object.entries(filter).filter(
		([, value]) => value !== undefined,
	);
	return matchAll({
		items: entries,
		match: ({ item: [key, value] }) =>
			matchFilterKey({ key, filter: value, parent, fields, path, context }),
	});
};

const matchFilterKey = <Parent>({
	key,
	filter,
	parent,
	fields,
	path,
	context,
}: MatchFilterArgs<Parent> & { key: string }): FilterMatch => {
	const fieldPath = joinFieldPath({ path, key });

	if (key === "$and" || key === "$or") {
		const isNonEmptyGroup = Array.isArray(filter) && filter.length > 0;
		if (!isNonEmptyGroup) return buildUnsupportedMatch({ field: fieldPath });

		const combine = key === "$and" ? matchAll : matchAny;
		return combine({
			items: filter,
			match: ({ item: branch }) =>
				matchFilter({ filter: branch, parent, fields, path, context }),
		});
	}

	const isKnownField = Object.keys(fields).includes(key);
	if (!isKnownField) return buildUnsupportedMatch({ field: fieldPath });

	try {
		return fields[key].match({ filter, parent, path: fieldPath, context });
	} catch {
		// Shared matchers throw on operators they don't implement yet ($regex);
		// a stored rule must never fail a request.
		return buildUnsupportedMatch({
			field: fieldPath,
			label: fields[key].label,
		});
	}
};
