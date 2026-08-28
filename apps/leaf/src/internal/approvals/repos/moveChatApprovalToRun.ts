import { chatApprovals } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

/** Keeps pending cards attached when Eve re-homes their conversation run. */
export const moveChatApprovalsToRun = async ({
	db,
	fromRunId,
	toRunId,
}: {
	db: ChatDb;
	fromRunId: string;
	toRunId: string;
}) => {
	await db
		.update(chatApprovals)
		.set({ run_id: toRunId })
		.where(
			and(
				eq(chatApprovals.run_id, fromRunId),
				eq(chatApprovals.status, "pending"),
			),
		);
};
