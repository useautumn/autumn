import type { ApprovalAction, ApprovalsCanResponse } from "@autumn/shared";
import { findAlwaysBlockingRule } from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isApprovalsLive } from "@/internal/approvals/evaluate/isApprovalsLive";
import { listRulesForAction } from "@/internal/approvals/evaluate/listRulesForAction";
import { resolveApprovalPrincipal } from "@/internal/approvals/principal/resolveApprovalPrincipal";
import { memberHasActionScope } from "./memberHasActionScope";

/**
 * Whether the caller could make any request for `action`: the scope decides, and
 * an enforced block that no allow outranks rules out every request.
 */
export const resolveApprovalCan = async ({
	ctx,
	action,
}: {
	ctx: AutumnContext;
	action: ApprovalAction;
}): Promise<ApprovalsCanResponse> => {
	if (!memberHasActionScope({ ctx, action }))
		return { can: false, reason: "none" };

	const principal = resolveApprovalPrincipal({ ctx });
	const rulesCanBlock =
		principal && isApprovalsLive({ ctx }) && ctx.org.config.approvals_enforced;
	if (!rulesCanBlock) return { can: true, reason: "scope" };

	const rules = await listRulesForAction({ ctx, action });
	if (findAlwaysBlockingRule({ principal, action, rules }))
		return { can: false, reason: "blocked" };
	return { can: true, reason: "scope" };
};
