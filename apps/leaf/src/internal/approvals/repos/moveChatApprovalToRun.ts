import { chatApprovals } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

/** Re-points a still-pending card whose run was re-homed, guarded on `fromRunId`
 * — run serialization is per-process, so a newer re-home elsewhere must win. */
export const moveChatApprovalToRun = async ({
	approvalId,
	db,
	fromRunId,
	toRunId,
}: {
	approvalId: string;
	db: ChatDb;
	fromRunId: string;
	toRunId: string;
}) => {
	await db
		.update(chatApprovals)
		.set({ run_id: toRunId })
		.where(
			and(
				eq(chatApprovals.id, approvalId),
				eq(chatApprovals.run_id, fromRunId),
				eq(chatApprovals.status, "pending"),
			),
		);
};
