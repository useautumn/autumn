import type { ApprovalRuleEffect as RuleEffect } from "../schemas/approvalRule";
import type { ApprovalFilterKey } from "../schemas/filters/approvalFilterShapes";
import { isPlainObject } from "../schemas/isPlainObject";
import {
	EDITOR_FIELDS,
	type EditorField,
	type EditorGroup,
	type EditorRow,
} from "./editorFields";
import { FIELD_CODECS } from "./fieldCodecs";
import {
	andViewsOf,
	type Filter,
	isEmptyObject,
	isSameFilter,
} from "./filterParts";
import { ruleRowsToFilter, shapeSchema } from "./ruleRowsToFilter";

export type RuleFilterToRowsResult =
	| { editable: true; groups: EditorGroup[] }
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
	(Object.keys(EDITOR_FIELDS[shape]) as EditorField[]).flatMap((field) =>
		andViewsOf(group).flatMap((view) =>
			readRows({ field, effect, filter: view }),
		),
	);

/** A top-level `$or` is the OR groups, unless a field reads it as its own row. */
const splitGroups = ({ shape, effect, group }: ReadInput) => {
	if (isEmptyObject(group)) return [];
	const isGroupList =
		Object.keys(group).length === 1 &&
		Array.isArray(group.$or) &&
		groupRows({ shape, effect, group }).length === 0;
	return isGroupList ? (group.$or as Filter[]) : [group];
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
		return { editable: true, groups: [] };
	}
	const schema = shapeSchema({ shape });
	if (!isPlainObject(filter) || !schema.safeParse(filter).success) {
		return { editable: false };
	}

	const groups = splitGroups({ shape, effect, group: filter }).map((group) =>
		groupRows({ shape, effect, group }),
	);
	const rebuilt = ruleRowsToFilter({ shape, effect, groups });
	return rebuilt.ok && isSameFilter(rebuilt.filter, filter)
		? { editable: true, groups }
		: { editable: false };
};
