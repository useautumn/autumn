import type { ApprovalAction } from "../actions/approvalActions";
import type { ApprovalRule } from "../schemas/approvalRule";
import { buildDenyMessage } from "./buildDenyMessage";
import type { ApprovalFactsFor } from "./facts/approvalFacts";
import { findMatchingRules } from "./resolve/findMatchingRules";
import { listAllowedRoles } from "./resolve/listAllowedRoles";
import { pickDecidingMatch } from "./resolve/pickDecidingMatch";
import type { ApprovalPrincipal } from "./types/approvalPrincipal";
import type { ApprovalVerdict } from "./types/approvalVerdict";

/** The rule's note, unless it's blank. */
const noteOf = ({ note }: { note: string | null }) =>
	note?.trim() ? note : null;

/**
 * Checks a member's request against the org's rules, after the coarse scope has
 * allowed it. Only matching rules count: the most specific level decides, then
 * the rule later in the list. Pure, so a preview and the write can't disagree.
 */
export const evaluateApprovalRules = <Action extends ApprovalAction>({
	principal,
	action,
	facts,
	rules,
	now = Date.now(),
}: {
	principal: ApprovalPrincipal;
	action: Action;
	facts: ApprovalFactsFor<Action>;
	rules: ApprovalRule[];
	/** Unix ms that relative dates (`{ days_from_now }`) resolve against. */
	now?: number;
}): ApprovalVerdict => {
	const context = { principal, now: new Date(now) };
	const matches = findMatchingRules({ rules, action, facts, context });
	const decider = pickDecidingMatch({ matches, principal });
	if (!decider) return { verdict: "allow", decided_by: null };

	const decidedBy = {
		level: decider.level,
		rule_id: decider.rule.id,
		rule_name: decider.rule.name,
	};
	if (decider.rule.effect === "allow")
		return { verdict: "allow", decided_by: decidedBy };

	return {
		verdict: "deny",
		decided_by: decidedBy,
		violations: decider.conditions,
		allowed_roles: listAllowedRoles({ matches }),
		message:
			noteOf({ note: decider.rule.note }) ??
			buildDenyMessage({
				ruleName: decider.rule.name,
				violations: decider.conditions,
			}),
	};
};
