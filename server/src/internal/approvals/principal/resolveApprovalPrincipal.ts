import type { ApprovalPrincipal } from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/**
 * The member a request acts as: a dashboard session, or an OAuth/MCP token
 * acting for its member. API keys carry no role, so they skip approvals.
 */
export const resolveApprovalPrincipal = ({
	ctx,
}: {
	ctx: AutumnContext;
}): ApprovalPrincipal | null => {
	if (!ctx.userId || !ctx.role) return null;
	return { user_id: ctx.userId, role_id: ctx.role };
};
