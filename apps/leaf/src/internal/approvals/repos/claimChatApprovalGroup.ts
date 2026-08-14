import { type ChatApproval, chatApprovals } from "@autumn/shared";
import { and, eq, gt, inArray } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

/**
 * Optimistic pending→running claim across the whole group. Returns the rows it
 * won; a short return means another click got there first, so the caller
 * releases and backs off rather than running a subset.
 */
export const claimChatApprovalGroup = async ({
	approvals,
	db,
	providerUserId,
}: {
	approvals: ChatApproval[];
	db: ChatDb;
	providerUserId: string;
}) => {
	if (approvals.length === 0) return [];
	return await db
		.update(chatApprovals)
		.set({
			status: "running",
			decided_at: Date.now(),
			decided_by_provider_user_id: providerUserId,
		})
		.where(
			and(
				inArray(
					chatApprovals.id,
					approvals.map((approval) => approval.id),
				),
				eq(chatApprovals.status, "pending"),
				gt(chatApprovals.expires_at, Date.now()),
			),
		)
		.returning();
};
