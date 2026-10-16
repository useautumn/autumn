import type { ApprovalAction, ApprovalRule } from "@autumn/shared";
import {
	type ApprovalFactsFor,
	type ApprovalPrincipal,
	type ApprovalVerdict,
	evaluateApprovalRules,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { resolveApprovalPrincipal } from "@/internal/approvals/principal/resolveApprovalPrincipal";
import { isApprovalsLive } from "./isApprovalsLive";
import { listRulesForAction } from "./listRulesForAction";

export type ApprovalEvaluation<Facts> = {
	principal: ApprovalPrincipal;
	rules: ApprovalRule[];
	facts: Facts;
	/** One verdict per set of facts: a multi request is judged item by item. */
	verdicts: ApprovalVerdict[];
};

/**
 * Judges a member's request against the org's rules. Null when nothing can
 * apply (no member, sandbox, or no rule for the action), so facts aren't built.
 */
export const evaluateApproval = async <
	Action extends ApprovalAction,
	Facts extends ApprovalFactsFor<Action>,
>({
	ctx,
	action,
	buildFacts,
	splitFacts = (facts) => [facts],
}: {
	ctx: AutumnContext;
	action: Action;
	buildFacts: () => Promise<Facts>;
	/** The facts each item is judged on, when one request holds several. */
	splitFacts?: (facts: Facts) => Facts[];
}): Promise<ApprovalEvaluation<Facts> | null> => {
	const principal = resolveApprovalPrincipal({ ctx });
	if (!principal || !isApprovalsLive({ ctx })) return null;

	const rules = await listRulesForAction({ ctx, action });
	if (rules.length === 0) return null;

	const facts = await buildFacts();
	const verdicts = splitFacts(facts).map((itemFacts) =>
		evaluateApprovalRules({ principal, action, facts: itemFacts, rules }),
	);
	return { principal, rules, facts, verdicts };
};
