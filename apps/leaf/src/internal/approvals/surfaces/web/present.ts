import type { AutumnLogger } from "@autumn/logging";
import type { ChatProvider } from "@autumn/shared";
import type { AgentHarnessName } from "../../../../lib/chatAgentConfig.js";
import { db } from "../../../../lib/db.js";
import { logger as rootLogger } from "../../../../lib/logger.js";
import type { AgentOutput } from "../../../../types.js";
import { chatApprovalRepo } from "../../repos/chatApprovalRepo.js";
import { approvalRequestFromOutput } from "../../utils/approvalRequest.js";
import { fetchApprovalPreview } from "../../utils/fetchApprovalPreview.js";

const getRequest = (args?: Record<string, unknown>) =>
	args?.request && typeof args.request === "object"
		? (args.request as Record<string, unknown>)
		: args;

/**
 * Record an approval for a suspended web turn. The dashboard fetches it via
 * `/agent/interactions` and renders the captured preview + approve/reject; there
 * is no card to post (the web stream is text-only). Returns the approval id, or
 * undefined when the suspension can't be resumed (so the caller can fall back to
 * plain text).
 */
export const presentWebApproval = async ({
	channelId,
	harness,
	logger = rootLogger,
	orgId,
	output,
	provider,
	providerUserId,
	token,
	workspaceId,
}: {
	channelId: string;
	harness: AgentHarnessName;
	logger?: AutumnLogger;
	orgId: string;
	output: AgentOutput;
	provider: ChatProvider;
	providerUserId: string;
	token: string;
	workspaceId: string;
}): Promise<{ approvalId: string; preview: unknown } | undefined> => {
	const approval = approvalRequestFromOutput(output);
	if (!approval) return undefined;
	if (!(approval.runId && approval.toolCallId)) {
		logger.warn("Skipped unexecutable web approval request", {
			event: "leaf.approval_unexecutable_skipped",
			context: { env: approval.env, org_id: orgId },
			tool: approval.toolName,
		});
		return undefined;
	}

	if (!approval.preview) {
		try {
			const request = getRequest(approval.toolArgs);
			if (request) {
				approval.preview = await fetchApprovalPreview({
					env: approval.env,
					logger,
					request,
					token,
					toolName: approval.toolName,
				});
			}
		} catch (error) {
			logger.warn("Could not backfill web approval preview", {
				event: "leaf.approval_preview_backfill_failed",
				tool: approval.toolName,
				error,
			});
		}
	}

	const approvalId = await chatApprovalRepo.insert({
		db,
		data: {
			orgId,
			provider,
			workspaceId,
			channelId,
			providerUserId,
			env: approval.env,
			harness,
			preview: approval.preview,
			runId: approval.runId,
			toolArgs: approval.toolArgs,
			toolCallId: approval.toolCallId,
			toolName: approval.toolName,
		},
	});

	logger.info("Created web approval request", {
		event: "leaf.approval_created",
		context: { env: approval.env, org_id: orgId },
		approval_id: approvalId,
		tool: approval.toolName,
	});

	return { approvalId, preview: approval.preview };
};
