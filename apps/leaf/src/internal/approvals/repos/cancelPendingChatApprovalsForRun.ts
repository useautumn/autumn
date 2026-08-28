import { chatApprovals } from "@autumn/shared";
import { and, eq, ne } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

export const cancelPendingChatApprovalsForRun = async ({
	db,
	exceptApprovalId,
	providerUserId,
	runId,
}: {
	db: ChatDb;
	exceptApprovalId?: string;
	providerUserId: string;
	runId: string;
}) =>
	db
		.update(chatApprovals)
		.set({
			decided_at: Date.now(),
			decided_by_provider_user_id: providerUserId,
			status: "cancelled",
		})
		.where(
			and(
				eq(chatApprovals.run_id, runId),
				eq(chatApprovals.status, "pending"),
				exceptApprovalId ? ne(chatApprovals.id, exceptApprovalId) : undefined,
			),
		)
		.returning();
