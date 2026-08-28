import { chatApprovals } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

export const detachPendingChatApprovalsForRun = async ({
	db,
	runId,
}: {
	db: ChatDb;
	runId: string;
}) =>
	db
		.update(chatApprovals)
		.set({ tool_call_id: null })
		.where(
			and(eq(chatApprovals.run_id, runId), eq(chatApprovals.status, "pending")),
		);
