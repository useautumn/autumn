import { chatApprovals } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

/** Writes backfilled tool_args (grouped step previews) onto a still-pending
 * row; a resolved approval keeps whatever it was approved with. */
export const setChatApprovalToolArgs = async ({
	approvalId,
	db,
	toolArgs,
}: {
	approvalId: string;
	db: ChatDb;
	toolArgs: Record<string, unknown>;
}) => {
	const updated = await db
		.update(chatApprovals)
		.set({ tool_args: toolArgs })
		.where(
			and(
				eq(chatApprovals.id, approvalId),
				eq(chatApprovals.status, "pending"),
			),
		)
		.returning({ id: chatApprovals.id });
	return updated.length > 0;
};
