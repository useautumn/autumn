import { type ChatApproval, chatApprovals } from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

export const cancelChatApprovalGroup = async ({
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
			status: "cancelled",
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
			),
		)
		.returning();
};
