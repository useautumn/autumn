import type { ApprovalUserPrincipal } from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/**
 * The member a request acts as. API keys keep their scopes and system flows
 * (webhooks, checkout completion) have no member, so neither is a rule subject.
 */
export const ctxToApprovalPrincipal = ({
	ctx,
}: {
	ctx: AutumnContext;
}): ApprovalUserPrincipal | null => {
	if (!ctx.userId || !ctx.role) return null;
	return { type: "user", user_id: ctx.userId, role: ctx.role };
};
