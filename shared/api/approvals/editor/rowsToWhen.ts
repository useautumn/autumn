import { buildWhenSchema } from "../schemas/when/buildWhenSchema";
import {
	type ApprovalRuleWhen,
	WHEN_SHAPES,
	type WhenKey,
} from "../schemas/when/whenSchemas";
import {
	EDITOR_FIELDS,
	type EditorGroup,
	type EditorRow,
} from "./editorFields";
import { FIELD_CODECS } from "./fieldCodecs";
import { type Filter, mergeFilters } from "./filterParts";

export type EditorRowIssue = { group: number; row: number; message: string };

export type RowsToWhenResult =
	| { ok: true; when: ApprovalRuleWhen | null }
	| { ok: false; issues: EditorRowIssue[] };

const rowIssue = ({ area, row }: { area: WhenKey; row: EditorRow }) => {
	const fields: Record<string, readonly string[]> = EDITOR_FIELDS[area];
	if (!Object.hasOwn(fields, row.field)) {
		return "This condition isn't available for these actions.";
	}
	if (!fields[row.field].includes(row.operator)) {
		return "This operator isn't available for this condition.";
	}
	return null;
};

/** The row's filter, or null when its value is missing or doesn't fit the field. */
const encodeRow = ({ area, row }: { area: WhenKey; row: EditorRow }) => {
	if (row.value === null && row.operator !== "has_none") return null;
	const filter = FIELD_CODECS[row.field].toFilter(row);
	const schema = buildWhenSchema({ shape: WHEN_SHAPES[area] });
	return filter && schema.safeParse(filter).success ? filter : null;
};

const groupToFilter = ({
	area,
	rows,
	group,
}: {
	area: WhenKey;
	rows: EditorGroup;
	group: number;
}) => {
	let filter: Filter = {};
	const issues: EditorRowIssue[] = [];
	const order = Object.keys(EDITOR_FIELDS[area]);
	// Board order makes the stored form canonical, so it reads back the same.
	const inBoardOrder = rows
		.map((row, index) => ({ row, index }))
		.sort((a, b) => order.indexOf(a.row.field) - order.indexOf(b.row.field));
	for (const { row, index } of inBoardOrder) {
		const fieldIssue = rowIssue({ area, row });
		const addition = fieldIssue ? null : encodeRow({ area, row });
		if (addition) {
			filter = mergeFilters({ base: filter, addition });
			continue;
		}
		const message = fieldIssue ?? "Choose a value for this condition.";
		issues.push({ group, row: index, message });
	}
	return { filter, issues };
};

/** Editor rows → the rule's stored `when`; null = always. Groups are ORed, rows ANDed. */
export const rowsToWhen = ({
	area,
	groups,
}: {
	area: WhenKey;
	groups: EditorGroup[];
}): RowsToWhenResult => {
	const encoded = groups
		.map((rows, group) => groupToFilter({ area, rows, group }))
		.filter((_, group) => groups[group].length > 0);
	const issues = encoded.flatMap((group) => group.issues);
	if (issues.length > 0) return { ok: false, issues };

	const filters = encoded.map((group) => group.filter);
	if (filters.length === 0) return { ok: true, when: null };
	const when = filters.length > 1 ? { $or: filters } : filters[0];
	return { ok: true, when: when as ApprovalRuleWhen };
};
