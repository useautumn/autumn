import { chatApprovals } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

export const releaseChatApproval = async ({
	approvalId,
	db,
	providerUserId,
}: {
	approvalId: string;
	db: ChatDb;
	providerUserId: string;
}) => {
	const [released] = await db
		.update(chatApprovals)
		.set({
			status: "pending",
			decided_at: null,
			decided_by_provider_user_id: null,
		})
		.where(
			and(
				eq(chatApprovals.id, approvalId),
				eq(chatApprovals.status, "running"),
				eq(chatApprovals.decided_by_provider_user_id, providerUserId),
			),
		)
		.returning();
	return released;
};
