import { type ChatApproval, chatApprovals } from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

/**
 * Stamp the outcome on rows the caller still holds. Scoped to its own running
 * claim so a group taken over mid-run can't be stamped by the loser.
 */
export const finalizeChatApprovalGroup = async ({
	approvals,
	db,
	providerUserId,
	status,
}: {
	approvals: ChatApproval[];
	db: ChatDb;
	providerUserId: string;
	status: "approved" | "failed";
}) => {
	if (approvals.length === 0) return [];
	return await db
		.update(chatApprovals)
		.set({
			status,
			decided_at: Date.now(),
			decided_by_provider_user_id: providerUserId,
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
