import type { ApprovalRule } from "../../schemas/approvalRule";
import { APPROVAL_LEVELS, type ApprovalLevel } from "../types/approvalVerdict";

export type RankedRule = {
	rule: Pick<ApprovalRule, "id" | "position">;
	level: ApprovalLevel;
};

/**
 * Sorts the deciding rule first: the most specific level, then the rule defined
 * later in the list, then the id, so the result never depends on input order.
 */
export const compareRuleRank = (a: RankedRule, b: RankedRule) =>
	APPROVAL_LEVELS.indexOf(a.level) - APPROVAL_LEVELS.indexOf(b.level) ||
	b.rule.position - a.rule.position ||
	b.rule.id.localeCompare(a.rule.id);
