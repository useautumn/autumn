import { chatApprovals } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

/** Pending-guarded: a resolved card keeps the preview it was approved with. */
export const setChatApprovalPreview = async ({
	approvalId,
	db,
	preview,
}: {
	approvalId: string;
	db: ChatDb;
	preview: unknown;
}) => {
	const updated = await db
		.update(chatApprovals)
		.set({ preview })
		.where(
			and(
				eq(chatApprovals.id, approvalId),
				eq(chatApprovals.status, "pending"),
			),
		)
		.returning({ id: chatApprovals.id });
	return updated.length > 0;
};
