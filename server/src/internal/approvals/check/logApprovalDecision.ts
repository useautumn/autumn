import { type ApprovalRule, AuthType } from "@autumn/shared";
import type {
	ApprovalPrincipal,
	ApprovalVerdict,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { approvalDecisionRepo } from "@/internal/approvals/repos/index";
import { generateId } from "@/utils/genUtils";

/**
 * One row per write a rule decided. A token-made decision says so: a Slack install
 * that isn't per-user acts as its installer, and shadow data has to show that.
 */
export const logApprovalDecision = async ({
	ctx,
	action,
	principal,
	rules,
	verdict,
	enforced,
	facts,
}: {
	ctx: AutumnContext;
	action: string;
	principal: ApprovalPrincipal;
	rules: ApprovalRule[];
	verdict: ApprovalVerdict;
	enforced: boolean;
	facts: Record<string, unknown>;
}) => {
	if (!verdict.decided_by) return;
	const decidedRuleId = verdict.decided_by.rule_id;

	await approvalDecisionRepo.insert({
		db: ctx.db,
		decision: {
			id: generateId("apd"),
			org_id: ctx.org.id,
			request_id: ctx.id,
			action,
			user_id: principal.user_id,
			role: principal.role_id,
			verdict: verdict.verdict,
			enforced,
			decided_by: verdict.decided_by,
			rule_version:
				rules.find(({ id }) => id === decidedRuleId)?.version ?? null,
			violations: verdict.verdict === "deny" ? verdict.violations : [],
			facts: {
				...facts,
				acted_via: ctx.authType === AuthType.Dashboard ? "dashboard" : "token",
			},
		},
	});
};
