import { type ChatApproval, chatApprovals } from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

/**
 * Revert claims the given clicker just made (running→pending) so another user
 * can still decide the group. Scoped to the claimer's own running rows so it
 * can never disturb a claim someone else now holds.
 */
export const releaseChatApprovalGroup = async ({
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
			status: "pending",
			decided_at: null,
			decided_by_provider_user_id: null,
		})
		.where(
			and(
				inArray(
					chatApprovals.id,
					approvals.map((approval) => approval.id),
				),
				eq(chatApprovals.status, "running"),
				eq(chatApprovals.decided_by_provider_user_id, providerUserId),
			),
		)
		.returning();
};
