import { isPlainObject } from "../schemas/isPlainObject";
import { buildWhenSchema } from "../schemas/when/buildWhenSchema";
import { WHEN_SHAPES, type WhenKey } from "../schemas/when/whenSchemas";
import {
	EDITOR_FIELDS,
	type EditorField,
	type EditorGroup,
	type EditorRow,
} from "./editorFields";
import { FIELD_CODECS } from "./fieldCodecs";
import { type Filter, isEmptyObject, isSameFilter } from "./filterParts";
import { rowsToWhen } from "./rowsToWhen";

export type WhenToRowsResult =
	| { editable: true; groups: EditorGroup[] }
	| { editable: false };

const readRows = ({ field, filter }: { field: EditorField; filter: Filter }) =>
	FIELD_CODECS[field]
		.fromFilter(filter)
		.map((read) => ({ field, ...read }) as EditorRow);

/** Rows in board order, so the editor shows them the way it lists fields. */
const groupRows = ({ area, group }: { area: WhenKey; group: Filter }) =>
	(Object.keys(EDITOR_FIELDS[area]) as EditorField[]).flatMap((field) =>
		readRows({ field, filter: group }),
	);

/** A top-level `$or` is the OR groups, unless a field reads it as its own row. */
const splitGroups = ({ area, when }: { area: WhenKey; when: Filter }) => {
	if (isEmptyObject(when)) return [];
	const isGroupList =
		Object.keys(when).length === 1 &&
		Array.isArray(when.$or) &&
		groupRows({ area, group: when }).length === 0;
	return isGroupList ? (when.$or as Filter[]) : [when];
};

/**
 * A stored `when` → editor rows. Anything the rows can't rebuild exactly
 * (hand-written shapes, unknown fields, bad values) is `{ editable: false }`.
 */
export const whenToRows = ({
	area,
	when,
}: {
	area: WhenKey;
	when: unknown;
}): WhenToRowsResult => {
	if (when === null || when === undefined || isEmptyObject(when)) {
		return { editable: true, groups: [] };
	}
	const schema = buildWhenSchema({ shape: WHEN_SHAPES[area] });
	if (!isPlainObject(when) || !schema.safeParse(when).success) {
		return { editable: false };
	}

	const groups = splitGroups({ area, when }).map((group) =>
		groupRows({ area, group }),
	);
	const rebuilt = rowsToWhen({ area, groups });
	return rebuilt.ok && isSameFilter(rebuilt.when, when)
		? { editable: true, groups }
		: { editable: false };
};
