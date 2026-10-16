import { AppEnv, type ApprovalAction, type ApprovalRule } from "@autumn/shared";
import type {
	ApprovalUserPrincipal,
	ApprovalVerdict,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { approvalDecisionRepo } from "@/internal/approvals/repos/index.js";
import { generateId } from "@/utils/genUtils";

/** One `approval_decisions` row per write the rules decided. Shadow mode logs denies it doesn't block. */
export const logApprovalDecision = async ({
	ctx,
	principal,
	action,
	verdict,
	rules,
	facts,
	enforced,
}: {
	ctx: AutumnContext;
	principal: ApprovalUserPrincipal;
	action: ApprovalAction;
	verdict: Exclude<ApprovalVerdict, { verdict: "fallback" }>;
	rules: ApprovalRule[];
	facts: unknown;
	enforced: boolean;
}) => {
	const decidedBy = verdict.decided_by;
	const decidingRule = rules.find((rule) => rule.id === decidedBy?.rule_id);

	await approvalDecisionRepo.insert({
		db: ctx.db,
		decision: {
			id: generateId("apd"),
			org_id: ctx.org.id,
			env: AppEnv.Live,
			request_id: ctx.id,
			action,
			user_id: principal.user_id,
			role: principal.role,
			verdict: verdict.verdict,
			enforced,
			decided_by: decidedBy,
			rule_version: decidingRule?.version ?? null,
			violations: verdict.verdict === "deny" ? verdict.violations : [],
			facts,
		},
	});
};
