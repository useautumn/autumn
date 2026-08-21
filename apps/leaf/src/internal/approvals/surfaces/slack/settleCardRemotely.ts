import type { ChatApproval } from "@autumn/shared";
import { bot } from "../../../../bot.js";
import { db } from "../../../../lib/db.js";
import { logger } from "../../../../lib/logger.js";
import {
	type ApprovalCardStatus,
	approvalStatusCard,
} from "../../../../ui/blocks.js";
import { withheldStepsOf } from "../../domain/approvalRecord.js";
import { chatApprovalStepsRepo } from "../../repos/chatApprovalStepsRepo.js";
import type { ApprovalStepOutcome } from "../../types.js";

/** Edits an approval's Slack card without a live event — used when the
 * decision happened on another surface (dashboard apply/supersede). */
export const settleCardRemotely = async ({
	approval,
	statusLine,
	status,
	steps,
}: {
	approval: ChatApproval;
	status: ApprovalCardStatus;
	statusLine?: string;
	steps?: ReadonlyArray<ApprovalStepOutcome>;
}) => {
	if (!approval.message_ts) {
		logger.warn("No message_ts to settle approval card remotely", {
			event: "leaf.approval_remote_settle_skipped",
			approval_id: approval.id,
		});
		return;
	}
	try {
		await bot.initialize();
		const thread = bot.thread(approval.channel_id);
		const stepRows = await chatApprovalStepsRepo.list({
			approvalId: approval.id,
			db,
		});
		await thread.adapter.editMessage?.(
			approval.channel_id,
			approval.message_ts,
			approvalStatusCard({
				actorId: approval.decided_by_provider_user_id ?? undefined,
				env: approval.env,
				groupedSteps: withheldStepsOf({ approval, steps: stepRows }),
				preview: approval.preview ?? undefined,
				status,
				statusLine,
				steps,
				toolArgs: approval.tool_args,
				toolName: approval.tool_name,
			}) as never,
		);
	} catch (error) {
		logger.warn("Could not settle approval card remotely", {
			event: "leaf.approval_remote_settle_failed",
			approval_id: approval.id,
			data: { error },
		});
	}
};
