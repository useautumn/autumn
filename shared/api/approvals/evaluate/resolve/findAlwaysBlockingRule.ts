import type { ApprovalAction } from "../../actions/approvalActions";
import type { ApprovalRule } from "../../schemas/approvalRule";
import type { ApprovalPrincipal } from "../types/approvalPrincipal";
import type { ApprovalDecidedBy } from "../types/approvalVerdict";
import { compareRuleRank } from "./compareRuleRank";
import { ruleLevelForPrincipal } from "./ruleLevelForPrincipal";

/**
 * The block rule that denies this person every request for the action, without
 * looking at a request: an unconditional block that no allow naming them outranks.
 * Conditional rules can only be judged per request, through the preview.
 */
export const findAlwaysBlockingRule = ({
	principal,
	action,
	rules,
}: {
	principal: ApprovalPrincipal;
	action: ApprovalAction;
	rules: ApprovalRule[];
}): ApprovalDecidedBy | null => {
	const ranked = rules
		.filter((rule) => rule.enabled && rule.actions.includes(action))
		.flatMap((rule) => {
			const level = ruleLevelForPrincipal({ rule, principal });
			return level ? [{ rule, level }] : [];
		})
		.sort(compareRuleRank);

	// `{}` matches every request, the same as no filter.
	const topUnconditional = ranked.find(
		({ rule }) => rule.filter === null || Object.keys(rule.filter).length === 0,
	);
	if (!topUnconditional || topUnconditional.rule.effect !== "block")
		return null;

	// Any allow ranked above it, conditional or not, wins some request.
	const outrankingAllow = ranked
		.slice(0, ranked.indexOf(topUnconditional))
		.some(({ rule }) => rule.effect === "allow");
	if (outrankingAllow) return null;

	return {
		level: topUnconditional.level,
		rule_id: topUnconditional.rule.id,
		rule_name: topUnconditional.rule.name,
	};
};
