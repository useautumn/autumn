import type { ApprovalRuleWhen, WhenKey } from "../schemas/when/whenSchemas";
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
	rows.forEach((row, index) => {
		const message = rowIssue({ area, row });
		const addition = message ? null : FIELD_CODECS[row.field].toFilter(row);
		const merged = addition && mergeFilters({ base: filter, addition });
		if (merged) filter = merged;
		else {
			issues.push({
				group,
				row: index,
				message:
					message ??
					"This condition can't be combined with another one in its group.",
			});
		}
	});
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
