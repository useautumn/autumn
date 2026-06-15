import { chatApprovals } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

export const setChatApprovalMessageTs = async ({
	approvalId,
	db,
	messageTs,
}: {
	approvalId: string;
	db: ChatDb;
	messageTs: string;
}) => {
	await db
		.update(chatApprovals)
		.set({ message_ts: messageTs })
		.where(eq(chatApprovals.id, approvalId));
};
