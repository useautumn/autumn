import type { ApprovalRuleEffect } from "../schemas/approvalRule";
import type { ApprovalRuleIssue, FilterEntry } from "./types";

/**
 * `$every` matches an empty list, so a block on "every incoming plan is X" would
 * also block requests that add no plan. Block rules say `$some` or `$none`.
 */
export const findEveryInBlockRules = ({
	effect,
	entries,
}: {
	effect: ApprovalRuleEffect;
	entries: FilterEntry[];
}): ApprovalRuleIssue[] => {
	if (effect !== "block") return [];
	return entries
		.filter(({ key }) => key === "$every")
		.map((entry) => ({
			path: entry.path.join("."),
			message:
				'Block rules can\'t use "every": it also matches when there are none. Use "any" or "none".',
		}));
};
