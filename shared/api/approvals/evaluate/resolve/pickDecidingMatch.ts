import type { ApprovalPrincipal } from "../types/approvalPrincipal";
import type { ApprovalLevel } from "../types/approvalVerdict";
import { compareRuleRank } from "./compareRuleRank";
import type { RuleMatch } from "./findMatchingRules";
import { ruleLevelForPrincipal } from "./ruleLevelForPrincipal";

/** The matching rule that decides for this person, or null when none names them. */
export const pickDecidingMatch = ({
	matches,
	principal,
}: {
	matches: RuleMatch[];
	principal: ApprovalPrincipal;
}): (RuleMatch & { level: ApprovalLevel }) | null => {
	const ranked = matches.flatMap((match) => {
		const level = ruleLevelForPrincipal({ rule: match.rule, principal });
		return level ? [{ ...match, level }] : [];
	});
	return ranked.sort(compareRuleRank)[0] ?? null;
};
