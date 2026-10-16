import { AppEnv, type ApprovalAction } from "@autumn/shared";
import { findDecidingLevel } from "@autumn/shared/api/approvals/evaluate/levels/findDecidingLevel.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { listRulesForAction } from "@/internal/approvals/evaluate/listRulesForAction";
import { resolveApprovalPrincipal } from "@/internal/approvals/evaluate/resolveApprovalPrincipal";
import { resolveApprovalsEnv } from "@/internal/approvals/evaluate/resolveApprovalsEnv";

/**
 * Whether the org's rules decide `action` for this member: some level names
 * them. Only enforced orgs count, so shadow mode never widens access.
 */
export const memberRulesGrantAction = async ({
	ctx,
	action,
}: {
	ctx: AutumnContext;
	action: ApprovalAction;
}): Promise<boolean> => {
	if (ctx.org?.config?.approvals_enforced !== true) return false;

	const principal = await resolveApprovalPrincipal({ ctx });
	if (!principal) return false;
	if (resolveApprovalsEnv({ ctx }) !== AppEnv.Live) return false;

	const rules = await listRulesForAction({ ctx, action });
	return findDecidingLevel({ principal, rules }) !== null;
};
