import type { ApprovalRuleIssue, WhenEntry } from "./types";

const isEmptyGroup = ({ key, value }: WhenEntry) =>
	(key === "$or" || key === "$and") &&
	Array.isArray(value) &&
	value.length === 0;

/** An empty `$or` can never match; an empty `$and` is a leftover editor group. */
export const findEmptyGroups = ({
	entries,
}: {
	entries: WhenEntry[];
}): ApprovalRuleIssue[] =>
	entries.filter(isEmptyGroup).map((entry) => ({
		path: entry.path.join("."),
		message: "This group has no conditions. Add one or remove the group.",
	}));
