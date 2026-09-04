import type { AppEnv } from "@autumn/shared";
import { db } from "../../../../../lib/db.js";
import { logger } from "../../../../../lib/logger.js";
import { pendingApprovalNotes } from "../../../../approvals/domain/pendingApprovalNotes.js";
import { chatApprovalRepo } from "../../../../approvals/repos/chatApprovalRepo.js";
import { chatApprovalWritesRepo } from "../../../../approvals/repos/chatApprovalWritesRepo.js";
import type {
	AgentThreadRef,
	PendingApprovalNote,
} from "../../../domain/agentTurnContext.js";

/** The cards still awaiting a decision on this session, echoed to the model
 * on every steer turn so a follow-up that changes the request has the exact
 * body to adjust. Best effort: a lookup failure costs the note, never the
 * turn. */
export const loadPendingApprovals = async ({
	env,
	orgId,
	sessionId,
	thread,
}: {
	env: AppEnv;
	orgId: string;
	sessionId: string;
	thread: AgentThreadRef;
}): Promise<ReadonlyArray<PendingApprovalNote>> => {
	try {
		const approvals = await chatApprovalRepo.listPendingForRun({
			channelId: thread.channelId,
			db,
			env,
			orgId,
			provider: thread.provider,
			runId: sessionId,
			workspaceId: thread.workspaceId,
		});
		if (!approvals.length) return [];
		const writesByApprovalId = new Map(
			await Promise.all(
				approvals.map(
					async (approval) =>
						[
							approval.id,
							await chatApprovalWritesRepo.list({
								approvalId: approval.id,
								db,
							}),
						] as const,
				),
			),
		);
		return pendingApprovalNotes({ approvals, writesByApprovalId });
	} catch (error) {
		logger.warn("Could not load pending approvals for the turn message", {
			event: "leaf.pending_approval_note_failed",
			data: { session_id: sessionId },
			error,
		});
		return [];
	}
};
