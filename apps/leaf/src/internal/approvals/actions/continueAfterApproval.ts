import type { ChatApproval } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { logger as rootLogger } from "../../../lib/logger.js";
import { runSlackAgentTurn } from "../../../providers/slack/actions/runSlackAgentTurn.js";
import type { SlackChatInstallation } from "../../../providers/slack/domain/slackAgentTurn.js";
import { findInstallation } from "../../../providers/slack/installations.js";
import { presentSlackAgentTurn } from "../../../providers/slack/presenters/presentSlackAgentTurn.js";
import type { ReplyTarget } from "../../../ui/progress.js";
import { dispatchThreadMessage } from "../../runs/runCoordinator.js";
import {
	closeRun,
	registerRun,
	runKeyForThread,
} from "../../runs/runRegistry.js";
import { chatApprovalWritesRepo } from "../repos/chatApprovalWritesRepo.js";
import type { ApprovalRunResult } from "../types.js";
import { approvalOutcomeNotice } from "../utils/approvalOutcomeNotice.js";

const runFollowUpTurn = async ({
	approval,
	installation,
	notice,
	providerUserId,
	runKey,
	target,
	threadId,
}: {
	approval: ChatApproval;
	installation: SlackChatInstallation;
	notice: string;
	providerUserId: string;
	runKey: string;
	target: ReplyTarget;
	threadId: string;
}) => {
	const run = registerRun({
		key: runKey,
		kind: "approval",
		ownerProviderUserId: providerUserId,
	});
	try {
		const output = await runSlackAgentTurn({
			channelId: approval.channel_id,
			installation,
			providerUserId,
			run,
			text: notice,
			threadId,
		});
		// Neither is presentable, and neither can happen on a turn nobody drives.
		if (output.kind === "blocked" || output.kind === "stopped") {
			rootLogger.info("Approval follow-up turn did not run", {
				event: "leaf.approval_continue_skipped",
				approval_id: approval.id,
				data: { kind: output.kind },
			});
			return;
		}
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
	} finally {
		closeRun({ key: runKey, run });
	}
};

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
		// Provider + workspace identify the installation. The approval's org is
		// the org acted on, which for the internal admin install differs from
		// the installation's own org — matching on it found nothing, so admin
		// approvals never got a follow-up turn.
		const installation = await findInstallation(
			approval.provider,
			approval.workspace_id,
		);
		if (!installation) {
			rootLogger.warn("No installation for approval; agent not resumed", {
				event: "leaf.approval_continue_no_installation",
				approval_id: approval.id,
				data: {
					provider: approval.provider,
					workspace_id: approval.workspace_id,
				},
			});
			return;
		}
		// The same per-thread door every Slack message goes through: a live run
		// absorbs the notice into its turn, otherwise the follow-up waits its
		// turn and registers itself so messages arriving during it queue too.
		const runKey = runKeyForThread({
			channelId: approval.channel_id,
			provider: "slack",
			threadId,
			workspaceId: approval.workspace_id,
		});
		await dispatchThreadMessage({
			hasAttachments: false,
			origin: "system",
			providerUserId,
			runKey,
			runNewMessage: () =>
				runFollowUpTurn({
					approval,
					installation,
					notice,
					providerUserId,
					runKey,
					target,
					threadId,
				}),
			text: notice,
		});
	} catch (error) {
		rootLogger.warn("Could not continue after approval", {
			event: "leaf.approval_continue_failed",
			approval_id: approval.id,
			error,
		});
	}
};
