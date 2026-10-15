import { isPlainObject } from "../schemas/isPlainObject";
import { buildWhenSchema } from "../schemas/when/buildWhenSchema";
import { WHEN_SHAPES, type WhenKey } from "../schemas/when/whenSchemas";
import {
	EDITOR_FIELDS,
	type EditorField,
	type EditorGroup,
	type EditorRow,
	PINNED_FIELDS,
} from "./editorFields";
import { FIELD_CODECS } from "./fieldCodecs";
import { type Filter, isEmptyObject, isSameFilter } from "./filterParts";
import { rowsToWhen } from "./rowsToWhen";

export type WhenToRowsResult =
	| { editable: true; pinned: EditorRow | null; groups: EditorGroup[] }
	| { editable: false };

const readRows = ({ field, filter }: { field: EditorField; filter: Filter }) =>
	FIELD_CODECS[field]
		.fromFilter(filter)
		.map((read) => ({ field, ...read }) as EditorRow);

/** Rows in board order, so the editor shows them the way it lists fields. */
const groupRows = ({ area, group }: { area: WhenKey; group: Filter }) =>
	(Object.keys(EDITOR_FIELDS[area]) as EditorField[])
		.filter((field) => field !== PINNED_FIELDS[area])
		.flatMap((field) => readRows({ field, filter: group }));

/** A top-level `$or` is the OR groups, unless it's one row's cap (Refund ≤ $50). */
const splitGroups = ({ area, when }: { area: WhenKey; when: Filter }) => {
	if (isEmptyObject(when)) return [];
	const isGroupList =
		Object.keys(when).length === 1 &&
		Array.isArray(when.$or) &&
		groupRows({ area, group: when }).length === 0;
	return isGroupList ? (when.$or as Filter[]) : [when];
};

/** The pinned row, and the rest of `when` for the groups. */
const splitPinned = ({ area, when }: { area: WhenKey; when: Filter }) => {
	const field = PINNED_FIELDS[area];
	const [pinned] = field ? readRows({ field, filter: when }) : [];
	if (!pinned) return { pinned: null, rest: when };
	const pinnedKeys = Object.keys(
		FIELD_CODECS[pinned.field].toFilter(pinned) ?? {},
	);
	const rest = Object.fromEntries(
		Object.entries(when).filter(([key]) => !pinnedKeys.includes(key)),
	);
	return { pinned, rest };
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
		return { editable: true, pinned: null, groups: [] };
	}
	const schema = buildWhenSchema({ shape: WHEN_SHAPES[area] });
	if (!isPlainObject(when) || !schema.safeParse(when).success) {
		return { editable: false };
	}

	const { pinned, rest } = splitPinned({ area, when });
	const groups = splitGroups({ area, when: rest }).map((group) =>
		groupRows({ area, group }),
	);
	const rebuilt = rowsToWhen({ area, pinned, groups });
	return rebuilt.ok && isSameFilter(rebuilt.when, when)
		? { editable: true, pinned, groups }
		: { editable: false };
};
