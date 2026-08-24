import type { ChatApproval } from "@autumn/shared";
import { bot } from "../../../../bot.js";
import { decrypt } from "../../../../lib/crypto.js";
import { db } from "../../../../lib/db.js";
import { errorMessage } from "../../../../lib/errorMessage.js";
import { logger } from "../../../../lib/logger.js";
import { findSlackInstallationForWorkspace } from "../../../../providers/slack/installations.js";
import {
	type ApprovalCardStatus,
	approvalStatusCard,
} from "../../../../ui/blocks.js";
import { withheldWritesOf } from "../../domain/approvalRecord.js";
import { chatApprovalWritesRepo } from "../../repos/chatApprovalWritesRepo.js";

/** Edits the Slack card without a live event (decided on another surface) —
 * no webhook token context exists, so the workspace bot token is resolved. */
export const settleCardRemotely = async ({
	approval,
	statusLine,
	status,
}: {
	approval: ChatApproval;
	status: ApprovalCardStatus;
	statusLine?: string;
}) => {
	if (!approval.message_ts) {
		logger.warn("No message_ts to settle approval card remotely", {
			event: "leaf.approval_remote_settle_skipped",
			approval_id: approval.id,
		});
		return;
	}
	try {
		const installation = await findSlackInstallationForWorkspace({
			workspaceId: approval.workspace_id,
		});
		if (!installation?.bot_access_token) {
			logger.warn("No installation token to settle approval card remotely", {
				event: "leaf.approval_remote_settle_skipped",
				approval_id: approval.id,
			});
			return;
		}
		await bot.initialize();
		const adapter = bot.getAdapter("slack");
		const writeRows = await chatApprovalWritesRepo.list({
			approvalId: approval.id,
			db,
		});
		await adapter.withBotToken(
			decrypt(installation.bot_access_token),
			() =>
				adapter.editMessage?.(
					approval.channel_id,
					approval.message_ts as string,
					approvalStatusCard({
						actorId: approval.decided_by_provider_user_id ?? undefined,
						env: approval.env,
						groupedWrites: withheldWritesOf({ approval, writes: writeRows }),
						preview: approval.preview ?? undefined,
						status,
						statusLine,
						toolArgs: approval.tool_args,
						toolName: approval.tool_name,
					}) as never,
				),
			{ installationId: approval.workspace_id },
		);
	} catch (error) {
		logger.warn("Could not settle approval card remotely", {
			event: "leaf.approval_remote_settle_failed",
			approval_id: approval.id,
			data: { error: errorMessage(error) },
		});
	}
};
