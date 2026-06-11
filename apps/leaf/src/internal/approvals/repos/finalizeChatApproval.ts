import { chatApprovals } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

export const finalizeChatApproval = async ({
	approvalId,
	db,
	providerUserId,
	status,
}: {
	approvalId: string;
	db: ChatDb;
	providerUserId: string;
	status: "approved" | "failed";
}) => {
	await db
		.update(chatApprovals)
		.set({
			status,
			decided_at: Date.now(),
			decided_by_provider_user_id: providerUserId,
		})
		.where(eq(chatApprovals.id, approvalId));
};
