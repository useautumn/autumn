import { isPlainObject } from "../schemas/isPlainObject";
import {
	EDITOR_FIELDS,
	type EditorField,
	type EditorGroup,
	type EditorRow,
	PINNED_FIELDS,
} from "./editorFields";
import { FIELD_CODECS } from "./fieldCodecs";
import {
	andViewsOf,
	type Filter,
	isEmptyObject,
	isSameFilter,
} from "./filterParts";
import { ruleRowsToFilter } from "./ruleRowsToFilter";
import {
	type ApprovalFilterKey,
	buildApprovalFilterSchema,
	type RuleEffect,
} from "./s3Stub";

export type RuleFilterToRowsResult =
	| { editable: true; pinned: EditorRow | null; groups: EditorGroup[] }
	| { editable: false };

type ReadInput = {
	shape: ApprovalFilterKey;
	effect: RuleEffect;
	group: Filter;
};

const readRows = ({
	field,
	effect,
	filter,
}: {
	field: EditorField;
	effect: RuleEffect;
	filter: Filter;
}) =>
	FIELD_CODECS[field]
		.fromFilter({ group: filter, effect })
		.map((read) => ({ field, ...read }) as EditorRow);

/** Rows in board order, so the editor shows them the way it lists fields. */
const groupRows = ({ shape, effect, group }: ReadInput) =>
	(Object.keys(EDITOR_FIELDS[shape]) as EditorField[])
		.filter((field) => field !== PINNED_FIELDS[shape])
		.flatMap((field) =>
			andViewsOf(group).flatMap((view) =>
				readRows({ field, effect, filter: view }),
			),
		);

/** A top-level `$or` is the OR groups, unless it's one row's cap (Refund ≤ $50). */
const splitGroups = ({ shape, effect, group }: ReadInput) => {
	if (isEmptyObject(group)) return [];
	const isGroupList =
		Object.keys(group).length === 1 &&
		Array.isArray(group.$or) &&
		groupRows({ shape, effect, group }).length === 0;
	return isGroupList ? (group.$or as Filter[]) : [group];
};

/** The pinned row, and the rest of the filter for the groups. */
const splitPinned = ({ shape, effect, group }: ReadInput) => {
	const field = PINNED_FIELDS[shape];
	const [pinned] = field ? readRows({ field, effect, filter: group }) : [];
	if (!pinned) return { pinned: null, rest: group };
	const pinnedKeys = Object.keys(
		FIELD_CODECS[pinned.field].toFilter({ row: pinned, effect }) ?? {},
	);
	const rest = Object.fromEntries(
		Object.entries(group).filter(([key]) => !pinnedKeys.includes(key)),
	);
	return { pinned, rest };
};

/**
 * A stored filter → editor rows. Anything the rows can't rebuild exactly
 * (hand-written shapes, unknown fields, a quantifier the effect doesn't
 * write) is `{ editable: false }`.
 */
export const ruleFilterToRows = ({
	shape,
	effect,
	filter,
}: {
	shape: ApprovalFilterKey;
	effect: RuleEffect;
	filter: unknown;
}): RuleFilterToRowsResult => {
	if (filter === null || filter === undefined || isEmptyObject(filter)) {
		return { editable: true, pinned: null, groups: [] };
	}
	const schema = buildApprovalFilterSchema({ key: shape });
	if (!isPlainObject(filter) || !schema.safeParse(filter).success) {
		return { editable: false };
	}

	const { pinned, rest } = splitPinned({ shape, effect, group: filter });
	const groups = splitGroups({ shape, effect, group: rest }).map((group) =>
		groupRows({ shape, effect, group }),
	);
	const rebuilt = ruleRowsToFilter({ shape, effect, pinned, groups });
	return rebuilt.ok && isSameFilter(rebuilt.filter, filter)
		? { editable: true, pinned, groups }
		: { editable: false };
};
