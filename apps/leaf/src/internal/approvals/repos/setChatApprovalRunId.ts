import { chatApprovals } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

/** Re-points a still-pending card at the run its session was re-homed onto —
 * the id it was created with no longer resolves, so it would be undecidable. */
export const setChatApprovalRunId = async ({
	approvalId,
	db,
	runId,
}: {
	approvalId: string;
	db: ChatDb;
	runId: string;
}) => {
	await db
		.update(chatApprovals)
		.set({ run_id: runId })
		.where(
			and(
				eq(chatApprovals.id, approvalId),
				eq(chatApprovals.status, "pending"),
			),
		);
};
