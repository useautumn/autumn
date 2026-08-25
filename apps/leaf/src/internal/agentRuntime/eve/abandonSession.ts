import type { AppEnv } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import { chatApprovalRepo } from "../../approvals/repos/chatApprovalRepo.js";
import type { AgentThreadRef } from "../domain/agentTurnContext.js";
import { deleteEveSession, type EveSessionDeleteReason } from "./repo.js";
import type { EveSessionRef } from "./types.js";
import { cancelSessionRun } from "./world/sessionRun.js";

/** Drops the row, cancels the eve run behind it so its hooks and parks
 * release, and cancels every card that could only be decided through it. */
export const abandonEveSession = async ({
	env,
	orgId,
	providerUserId,
	reason,
	session,
	thread,
}: {
	env: AppEnv;
	orgId: string;
	providerUserId: string;
	reason: EveSessionDeleteReason;
	session: EveSessionRef;
	thread: AgentThreadRef;
}) => {
	await deleteEveSession({
		db,
		env,
		orgId,
		reason,
		sessionId: session.sessionId,
		threadKey: session.threadKey,
	});
	const cancelledRun = await cancelSessionRun(session.sessionId);
	const orphaned = await chatApprovalRepo.listPendingForRun({
		db,
		channelId: thread.channelId,
		env,
		orgId,
		provider: thread.provider,
		runId: session.sessionId,
		workspaceId: thread.workspaceId,
	});
	for (const approval of orphaned) {
		await chatApprovalRepo.cancel({
			approvalId: approval.id,
			db,
			providerUserId,
		});
	}
	logger.warn("Abandoned eve session", {
		event: "leaf.eve_session_abandoned",
		data: {
			cancelled_run: cancelledRun,
			orphaned_approval_ids: orphaned.map((approval) => approval.id),
			reason,
			session_id: session.sessionId,
		},
	});
};
