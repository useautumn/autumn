import { ErrCode, member, RecaseError } from "@autumn/shared";
import type { ApprovalUserPrincipal } from "@autumn/shared/api/approvals/evaluate/index.js";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getApprovalsActingUser } from "@/internal/approvals/actingUser/approvalsActingUser";

/** The acting user's role in this org; a non-member is refused, never treated as the exempt token. */
const actingUserToPrincipal = async ({
	ctx,
	userId,
}: {
	ctx: AutumnContext;
	userId: string;
}): Promise<ApprovalUserPrincipal> => {
	const membership = await ctx.db.query.member.findFirst({
		where: and(
			eq(member.userId, userId),
			eq(member.organizationId, ctx.org.id),
		),
		columns: { role: true },
	});
	if (!membership) {
		throw new RecaseError({
			message: "The approving user isn't a member of this organization.",
			code: ErrCode.InvalidActingUser,
			statusCode: 403,
		});
	}
	return { type: "user", user_id: userId, role: membership.role };
};

/**
 * The member a request acts as: a dashboard session, or the Slack clicker Leaf
 * names. API keys and system flows have no member, so they're never rule subjects.
 */
export const resolveApprovalPrincipal = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ApprovalUserPrincipal | null> => {
	const actingUserId = getApprovalsActingUser({ ctx });
	if (actingUserId) return actingUserToPrincipal({ ctx, userId: actingUserId });

	if (!ctx.userId || !ctx.role) return null;
	return { type: "user", user_id: ctx.userId, role: ctx.role };
};
