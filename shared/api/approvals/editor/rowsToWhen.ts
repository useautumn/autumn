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
	PINNED_FIELDS,
} from "./editorFields";
import { FIELD_CODECS, INCOMING_PLAN } from "./fieldCodecs";
import { type Filter, isEmptyObject, mergeFilters } from "./filterParts";

/** `group: "pinned"` is the row above the groups. */
export type EditorRowIssue = {
	group: number | "pinned";
	row: number;
	message: string;
};

export type RowsToWhenResult =
	| { ok: true; when: ApprovalRuleWhen | null }
	| { ok: false; issues: EditorRowIssue[] };

const rowIssue = ({
	area,
	row,
	pinned,
}: {
	area: WhenKey;
	row: EditorRow;
	pinned: boolean;
}) => {
	const fields: Record<string, readonly string[]> = EDITOR_FIELDS[area];
	if (!Object.hasOwn(fields, row.field)) {
		return "This condition isn't available for these actions.";
	}
	if (!fields[row.field].includes(row.operator)) {
		return "This operator isn't available for this condition.";
	}
	if (pinned !== (PINNED_FIELDS[area] === row.field)) {
		return pinned
			? "Only the Feature condition sits above the groups."
			: "Feature is chosen once, above the groups.";
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
		const fieldIssue = rowIssue({ area, row, pinned: false });
		const addition = fieldIssue ? null : encodeRow({ area, row });
		const message =
			fieldIssue ?? (addition ? null : "Choose a value for this condition.");
		const merged =
			addition &&
			mergeFilters({ base: filter, addition, andPath: INCOMING_PLAN });
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
	}
	return { filter, issues };
};

/**
 * Editor rows → the rule's stored `when`; null = always. Groups are ORed,
 * rows in a group ANDed, and the pinned row applies to every group.
 */
export const rowsToWhen = ({
	area,
	pinned = null,
	groups,
}: {
	area: WhenKey;
	pinned?: EditorRow | null;
	groups: EditorGroup[];
}): RowsToWhenResult => {
	const pinnedFilter = pinned && encodeRow({ area, row: pinned });
	const pinnedIssue =
		pinned &&
		(rowIssue({ area, row: pinned, pinned: true }) ??
			(pinnedFilter ? null : "Choose a value for this condition."));
	const encoded = groups
		.map((rows, group) => groupToFilter({ area, rows, group }))
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
	const when = { ...pinnedFilter, ...conditions };
	return {
		ok: true,
		when: isEmptyObject(when) ? null : (when as ApprovalRuleWhen),
	};
};
