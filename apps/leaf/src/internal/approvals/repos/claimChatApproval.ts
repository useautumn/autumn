import { chatApprovals } from "@autumn/shared";
import { and, eq, gt } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

/** Optimistic pending→running claim; returns undefined when already decided or expired. */
export const claimChatApproval = async ({
	approvalId,
	db,
	providerUserId,
}: {
	approvalId: string;
	db: ChatDb;
	providerUserId: string;
}) => {
	const [claimed] = await db
		.update(chatApprovals)
		.set({
			status: "running",
			decided_at: Date.now(),
			decided_by_provider_user_id: providerUserId,
		})
		.where(
			and(
				eq(chatApprovals.id, approvalId),
				eq(chatApprovals.status, "pending"),
				gt(chatApprovals.expires_at, Date.now()),
			),
		)
		.returning();
	return claimed;
};
