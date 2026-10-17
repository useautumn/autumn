import type { RuleMatch } from "./findMatchingRules";
import { pickDecidingMatch } from "./pickDecidingMatch";

/**
 * Role ids whose own allow rule would win for this request, for "who can do
 * this" in a denial. Roles with no matching rule aren't listed: rules can't see scopes.
 */
export const listAllowedRoles = ({
	matches,
}: {
	matches: RuleMatch[];
}): string[] => {
	const namedRoleIds = matches.flatMap(({ rule }) =>
		rule.subjects.flatMap((subject) =>
			subject.type === "role" ? [subject.role_id] : [],
		),
	);
	return [...new Set(namedRoleIds)].filter((roleId) => {
		const decider = pickDecidingMatch({
			matches,
			principal: { user_id: "", role_id: roleId },
		});
		return decider?.level === "role" && decider.rule.effect === "allow";
	});
};
