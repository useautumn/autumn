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
	VALUELESS_OPERATORS,
} from "./editorFields";
import { FIELD_CODECS } from "./fieldCodecs";
import { type Filter, mergeFilters } from "./filterParts";

export type EditorRowIssue = { group: number; row: number; message: string };

export type RuleRowsToFilterResult =
	| { ok: true; filter: ApprovalRuleFilter | null }
	| { ok: false; issues: EditorRowIssue[] };

const rowIssue = ({
	shape,
	row,
}: {
	shape: ApprovalFilterKey;
	row: EditorRow;
}) => {
	const fields: Record<string, readonly string[]> = EDITOR_FIELDS[shape];
	if (!Object.keys(fields).includes(row.field)) {
		return "This condition isn't available for these actions.";
	}
	if (!fields[row.field].includes(row.operator)) {
		return "This operator isn't available for this condition.";
	}
	return null;
};

const isBlank = (value: unknown) =>
	value === undefined || value === null || value === "";

/** An empty id ("" or [""]) is an unfinished picker, not a condition. */
const hasValue = (row: EditorRow) => {
	if (VALUELESS_OPERATORS.includes(row.operator)) return true;
	if (Array.isArray(row.value))
		return row.value.length > 0 && !row.value.some(isBlank);
	return !isBlank(row.value);
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
		const fieldIssue = rowIssue({ shape, row });
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
 * rows in a group ANDed, and array quantifiers follow the rule's effect.
 */
export const ruleRowsToFilter = ({
	shape,
	effect,
	groups,
}: {
	shape: ApprovalFilterKey;
	effect: RuleEffect;
	groups: EditorGroup[];
}): RuleRowsToFilterResult => {
	const encoded = groups
		.map((rows, group) => groupToFilter({ shape, effect, rows, group }))
		.filter((_, group) => groups[group].length > 0);
	const issues = encoded.flatMap((group) => group.issues);
	if (issues.length > 0) return { ok: false, issues };

	const filters = encoded.map((group) => group.filter);
	if (filters.length === 0) return { ok: true, filter: null };
	const filter = filters.length > 1 ? { $or: filters } : filters[0];
	return { ok: true, filter: filter as ApprovalRuleFilter };
};
