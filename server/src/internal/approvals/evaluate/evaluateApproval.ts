import { AppEnv, type ApprovalAction, type ApprovalRule } from "@autumn/shared";
import {
	type ApprovalFacts,
	type ApprovalUserPrincipal,
	type ApprovalVerdict,
	EXEMPT_ROLES,
	evaluateApprovalRules,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { listRulesForAction } from "./listRulesForAction";
import { resolveApprovalPrincipal } from "./resolveApprovalPrincipal";
import { resolveApprovalsEnv } from "./resolveApprovalsEnv";

export type ApprovalResult<Facts extends ApprovalFacts = ApprovalFacts> = {
	principal: ApprovalUserPrincipal;
	rules: ApprovalRule[];
	verdict: ApprovalVerdict;
	/** Absent for exempt members, whose verdict needs no facts. */
	facts?: Facts;
};

/**
 * Checks a member's request against the org's approval rules. Null when no rule
 * applies, so orgs without rules pay one cached read; facts are built only after that.
 */
export const evaluateApproval = async <Facts extends ApprovalFacts>({
	ctx,
	action,
	buildFacts,
}: {
	ctx: AutumnContext;
	action: ApprovalAction;
	buildFacts: () => Promise<Facts>;
}): Promise<ApprovalResult<Facts> | null> => {
	const principal = await resolveApprovalPrincipal({ ctx });
	if (!principal) return null;

	const env = resolveApprovalsEnv({ ctx });
	if (env !== AppEnv.Live) return null;

	const rules = await listRulesForAction({ ctx, action });
	if (rules.length === 0) return null;

	if (EXEMPT_ROLES.includes(principal.role)) {
		return {
			principal,
			rules,
			verdict: { verdict: "allow", decided_by: null },
		};
	}

	const facts = await buildFacts();
	const verdict = evaluateApprovalRules({
		principal,
		action,
		facts,
		rules,
		env,
	});
	return { principal, rules, verdict, facts };
};
