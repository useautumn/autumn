import Anthropic from "@anthropic-ai/sdk";
import { claudeManagedConfig } from "../../../harness/claudeManaged/config.js";
import { driveSessionTurn } from "../../../harness/claudeManaged/session/driveSessionTurn.js";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import { approvalErrorResult } from "../utils/approvalErrors.js";

const client = new Anthropic();

// Claims a pending approval, then confirms the tool to the (still-idle) Claude
// Managed session — Anthropic runs the tool and continues the turn. The
// continuation text is returned for the Slack status card.
export const approveAndRun = async ({
	approvalId,
	providerUserId,
}: {
	approvalId: string;
	providerUserId: string;
}) => {
	const claimed = await chatApprovalRepo.claim({
		approvalId,
		db,
		providerUserId,
	});
	if (!claimed) throw new Error("Approval is no longer pending");
	const sessionId = claimed.run_id;
	const toolUseId = claimed.tool_call_id;

	try {
		if (!sessionId || !toolUseId) {
			throw new Error("Approval is missing the session or tool-call id");
		}
		const outcome = await driveSessionTurn({
			autumnMcpServerName: claudeManagedConfig.autumnMcpServerName,
			client,
			kickoff: () =>
				client.beta.sessions.events.send(sessionId, {
					events: [
						{
							result: "allow",
							tool_use_id: toolUseId,
							type: "user.tool_confirmation",
						},
					],
				}),
			sessionId,
		});
		const text = outcome.textParts.join("\n\n");
		const failed = Boolean(outcome.errorMessage) && !text;
		if (failed) {
			logger.error("[chat] Approval run failed", outcome.errorMessage, {
				event: "leaf.approval_run_failed",
				approval_id: approvalId,
			});
		}
		await chatApprovalRepo.finalize({
			approvalId,
			db,
			providerUserId,
			status: failed ? "failed" : "approved",
		});
		return failed ? approvalErrorResult(outcome.errorMessage) : { text };
	} catch (error) {
		logger.error("[chat] Approval run failed", error, {
			event: "leaf.approval_run_failed",
			approval_id: approvalId,
		});
		await chatApprovalRepo.finalize({
			approvalId,
			db,
			providerUserId,
			status: "failed",
		});
		return approvalErrorResult(error);
	}
};
