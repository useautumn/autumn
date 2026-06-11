import { chatApprovals } from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

export const getChatApproval = async ({
	approvalId,
	db,
}: {
	approvalId: string;
	db: ChatDb;
}) =>
	await db.query.chatApprovals.findFirst({
		where: eq(chatApprovals.id, approvalId),
	});
