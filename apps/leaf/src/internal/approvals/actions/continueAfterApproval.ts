import { type ChatApproval, chatInstallations } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { db } from "../../../lib/db.js";
import { logger as rootLogger } from "../../../lib/logger.js";
import { runSlackAgentTurn } from "../../../providers/slack/actions/runSlackAgentTurn.js";
import { presentSlackAgentTurn } from "../../../providers/slack/presenters/presentSlackAgentTurn.js";
import type { ReplyTarget } from "../../../ui/progress.js";
import { chatApprovalWritesRepo } from "../repos/chatApprovalWritesRepo.js";
import type { ApprovalRunResult } from "../types.js";
import { approvalOutcomeNotice } from "../utils/approvalOutcomeNotice.js";

/** A fresh turn confirms the applied change and finishes any remaining steps
 * of a multi-step request. */
export const continueAfterApproval = async ({
	approval,
	outcome,
	providerUserId,
	target,
	threadId,
}: {
	approval: ChatApproval;
	outcome: ApprovalRunResult;
	providerUserId: string;
	target: ReplyTarget;
	threadId: string;
}) => {
	try {
		// The writes ran outside the agent's turn, so every outcome — grouped
		// siblings and failures included — has to be handed back explicitly.
		const writes = await chatApprovalWritesRepo.list({
			approvalId: approval.id,
			db,
		});
		const notice = approvalOutcomeNotice({ outcome, writes });
		if (!notice) return;
		const installation = await db.query.chatInstallations.findFirst({
			where: and(
				eq(chatInstallations.org_id, approval.org_id),
				eq(chatInstallations.provider, approval.provider),
				eq(chatInstallations.workspace_id, approval.workspace_id),
			),
		});
		if (!installation) return;
		const output = await runSlackAgentTurn({
			channelId: approval.channel_id,
			installation,
			providerUserId,
			text: notice,
			threadId,
		});
		// Neither is presentable, and neither can happen on a turn nobody drives.
		if (output.kind === "blocked" || output.kind === "stopped") return;
		await presentSlackAgentTurn({
			channelId: approval.channel_id,
			logAction: () => undefined,
			logger: rootLogger,
			providerUserId,
			stopStatus: () => undefined,
			target,
			threadId,
			turn: output,
		});
	} catch (error) {
		rootLogger.warn("Could not continue after approval", {
			event: "leaf.approval_continue_failed",
			approval_id: approval.id,
			error,
		});
	}
};
