import { type ChatApproval, chatApprovals } from "@autumn/shared";
import { inArray } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

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
	if (approvals.length === 0) return;
	await db
		.update(chatApprovals)
		.set({
			status,
			decided_at: Date.now(),
			decided_by_provider_user_id: providerUserId,
		})
		.where(
			inArray(
				chatApprovals.id,
				approvals.map((approval) => approval.id),
			),
		);
};
