import { chatApprovals } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

/**
 * Revert a claim the given clicker just made (running→pending) so another user
 * can still decide the approval — used when the clicker turns out to lack the
 * Autumn scopes to run it. Scoped to the claimer's own running row so it can
 * never disturb a claim someone else now holds.
 */
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
