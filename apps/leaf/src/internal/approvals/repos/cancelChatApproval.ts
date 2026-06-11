import { chatApprovals } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

export const cancelChatApproval = async ({
	approvalId,
	db,
	providerUserId,
}: {
	approvalId: string;
	db: ChatDb;
	providerUserId: string;
}) => {
	const [cancelled] = await db
		.update(chatApprovals)
		.set({
			status: "cancelled",
			decided_at: Date.now(),
			decided_by_provider_user_id: providerUserId,
		})
		.where(
			and(
				eq(chatApprovals.id, approvalId),
				eq(chatApprovals.status, "pending"),
			),
		)
		.returning();
	return cancelled;
};
