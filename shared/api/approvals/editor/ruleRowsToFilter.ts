import type { ApprovalRuleEffect as RuleEffect } from "../schemas/approvalRule";
import {
	APPROVAL_FILTER_SHAPES,
	type ApprovalFilterKey,
	type ApprovalRuleFilter,
} from "../schemas/filters/approvalFilterShapes";
import { buildFilterSchema } from "../schemas/filters/buildFilterSchema";
import {
	EDITOR_FIELDS,
	type EditorGroup,
	type EditorRow,
	PINNED_FIELDS,
	VALUELESS_OPERATORS,
} from "./editorFields";
import { FIELD_CODECS } from "./fieldCodecs";
import { type Filter, isEmptyObject, mergeFilters } from "./filterParts";

/** `group: "pinned"` is the row above the groups. */
export type EditorRowIssue = {
	group: number | "pinned";
	row: number;
	message: string;
};

export type RuleRowsToFilterResult =
	| { ok: true; filter: ApprovalRuleFilter | null }
	| { ok: false; issues: EditorRowIssue[] };

const rowIssue = ({
	shape,
	row,
	pinned,
}: {
	shape: ApprovalFilterKey;
	row: EditorRow;
	pinned: boolean;
}) => {
	const fields: Record<string, readonly string[]> = EDITOR_FIELDS[shape];
	if (!Object.keys(fields).includes(row.field)) {
		return "This condition isn't available for these actions.";
	}
	if (!fields[row.field].includes(row.operator)) {
		return "This operator isn't available for this condition.";
	}
	if (pinned !== (PINNED_FIELDS[shape] === row.field)) {
		return pinned
			? "Only the Feature condition sits above the groups."
			: "Feature is chosen once, above the groups.";
	}
	return null;
};

const hasValue = (row: EditorRow) => {
	if (VALUELESS_OPERATORS.includes(row.operator)) return true;
	if (Array.isArray(row.value)) return row.value.length > 0;
	return row.value !== undefined && row.value !== null;
};

/** The strict schema for one shape, so a row's filter is checked against its own area. */
export const shapeSchema = ({ shape }: { shape: ApprovalFilterKey }) =>
	buildFilterSchema({ shape: APPROVAL_FILTER_SHAPES[shape] });

/** The row's filter, or null when its value is missing or doesn't fit the field. */
const encodeRow = ({
	shape,
	effect,
	row,
}: {
	shape: ApprovalFilterKey;
	effect: RuleEffect;
	row: EditorRow;
}) => {
	if (!hasValue(row)) return null;
	const filter = FIELD_CODECS[row.field].toFilter({ row, effect });
	const schema = shapeSchema({ shape });
	return filter && schema.safeParse(filter).success ? filter : null;
};

const groupToFilter = ({
	shape,
	effect,
	rows,
	group,
}: {
	shape: ApprovalFilterKey;
	effect: RuleEffect;
	rows: EditorGroup;
	group: number;
}) => {
	let filter: Filter = {};
	const issues: EditorRowIssue[] = [];
	const order = Object.keys(EDITOR_FIELDS[shape]);
	// Board order makes the stored form canonical, so it reads back the same.
	const inBoardOrder = rows
		.map((row, index) => ({ row, index }))
		.sort((a, b) => order.indexOf(a.row.field) - order.indexOf(b.row.field));
	for (const { row, index } of inBoardOrder) {
		const fieldIssue = rowIssue({ shape, row, pinned: false });
		const addition = fieldIssue ? null : encodeRow({ shape, effect, row });
		if (addition) {
			filter = mergeFilters({ base: filter, addition });
			continue;
		}
		const message = fieldIssue ?? "Choose a value for this condition.";
		issues.push({ group, row: index, message });
	}
	return { filter, issues };
};

/**
 * Editor rows → the rule's stored filter; null = always. Groups are ORed,
 * rows in a group ANDed, the pinned row applies to every group, and array
 * quantifiers follow the rule's effect.
 */
export const ruleRowsToFilter = ({
	shape,
	effect,
	pinned = null,
	groups,
}: {
	shape: ApprovalFilterKey;
	effect: RuleEffect;
	pinned?: EditorRow | null;
	groups: EditorGroup[];
}): RuleRowsToFilterResult => {
	const pinnedFilter = pinned && encodeRow({ shape, effect, row: pinned });
	const pinnedIssue =
		pinned &&
		(rowIssue({ shape, row: pinned, pinned: true }) ??
			(pinnedFilter ? null : "Choose a value for this condition."));
	const encoded = groups
		.map((rows, group) => groupToFilter({ shape, effect, rows, group }))
		.filter((_, group) => groups[group].length > 0);
	const issues = [
		...(pinnedIssue
			? [{ group: "pinned" as const, row: 0, message: pinnedIssue }]
			: []),
		...encoded.flatMap((group) => group.issues),
	];
	if (issues.length > 0) return { ok: false, issues };

	const filters = encoded.map((group) => group.filter);
	const conditions = filters.length > 1 ? { $or: filters } : (filters[0] ?? {});
	// Groups never hold the pinned field, so its keys can't collide with theirs.
	const filter = { ...pinnedFilter, ...conditions };
	return {
		ok: true,
		filter: isEmptyObject(filter) ? null : (filter as ApprovalRuleFilter),
	};
};
