import {
	type ApprovalAction,
	PermissionDeniedError,
	tryCatch,
} from "@autumn/shared";
import type { ApprovalFacts } from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { ApprovalResult } from "@/internal/approvals/evaluate/evaluateApproval";
import { rejectRuleAdmittedRequest } from "./access/rejectRuleAdmittedRequest";
import { logApprovalDecision } from "./logApprovalDecision";

export type CheckApprovalParams<Facts extends ApprovalFacts> = {
	ctx: AutumnContext;
	action: ApprovalAction;
	evaluate: () => Promise<ApprovalResult<Facts> | null>;
	/** Facts as stored on the decision row. */
	factsToJson: (args: { facts: Facts }) => unknown;
	/** False for a pre-check whose write is checked again; it then logs only a deny it blocks. */
	logDecision?: boolean;
};

const decideApproval = async <Facts extends ApprovalFacts>({
	ctx,
	action,
	evaluate,
	factsToJson,
	logDecision = true,
	enforced,
}: CheckApprovalParams<Facts> & { enforced: boolean }) => {
	const approval = await evaluate();
	const rulesDecide =
		approval !== null && approval.verdict.verdict !== "fallback";
	if (!rulesDecide) rejectRuleAdmittedRequest({ ctx, action });
	if (!approval) return;

	const { principal, rules, verdict, facts } = approval;
	// Exempt members and members no rule names keep today's checks, so there's nothing to log.
	if (verdict.verdict === "fallback" || !facts) return;

	// A pre-check that blocks is the last check, so its deny is the one logged.
	const blocks = enforced && verdict.verdict === "deny";
	if (logDecision || blocks) {
		await logApprovalDecision({
			ctx,
			principal,
			action,
			verdict,
			rules,
			facts: factsToJson({ facts }),
			enforced,
		});
	}

	if (!blocks) return;
	throw new PermissionDeniedError({
		message: verdict.message,
		violations: verdict.violations,
		decided_by: verdict.decided_by,
		allowed_roles: verdict.allowed_roles,
	});
};

/**
 * Checks a write against the org's approval rules before it runs, and logs the
 * decision. Only orgs with `approvals_enforced` are blocked.
 */
export const checkApproval = async <Facts extends ApprovalFacts>(
	params: CheckApprovalParams<Facts>,
) => {
	const enforced = params.ctx.org.config?.approvals_enforced === true;
	if (enforced) return decideApproval({ ...params, enforced });

	// Shadow mode never stops the write, even when logging fails.
	const { error } = await tryCatch(decideApproval({ ...params, enforced }));
	if (!error) return;
	params.ctx.logger.error("[approvals] shadow decision not logged", {
		error,
		action: params.action,
	});
};
