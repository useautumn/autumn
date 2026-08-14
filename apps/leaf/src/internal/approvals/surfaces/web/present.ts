import type { AutumnLogger } from "@autumn/logging";
import type { ChatProvider } from "@autumn/shared";
import type { AgentHarnessName } from "../../../../lib/chatAgentConfig.js";
import { db } from "../../../../lib/db.js";
import { logger as rootLogger } from "../../../../lib/logger.js";
import type { AgentOutput } from "../../../../types.js";
import { chatApprovalRepo } from "../../repos/chatApprovalRepo.js";
import {
	type ApprovalRequest,
	approvalRequestsFromOutput,
} from "../../utils/approvalRequest.js";
import {
	fetchApprovalPreview,
	shouldRefreshApprovalPreview,
} from "../../utils/fetchApprovalPreview.js";
import {
	publicToolArgs,
	toolRequestFromArgs,
} from "../../utils/toolRequest.js";

const withBackfilledPreview = async ({
	logger,
	request,
	token,
}: {
	logger: AutumnLogger;
	request: ApprovalRequest;
	token: string;
}) => {
	if (
		!shouldRefreshApprovalPreview({
			preview: request.preview,
			toolName: request.toolName,
		})
	) {
		return request;
	}
	try {
		const preview = await fetchApprovalPreview({
			env: request.env,
			logger,
			request: toolRequestFromArgs(publicToolArgs(request.toolArgs)),
			token,
			toolName: request.toolName,
		});
		return preview ? { ...request, preview } : request;
	} catch (error) {
		logger.warn("Could not backfill web approval preview", {
			event: "leaf.approval_preview_backfill_failed",
			tool: request.toolName,
			error,
		});
		return request;
	}
};

/**
 * Record the approvals a suspended web turn is waiting on. The dashboard
 * fetches them via `/agent/interactions` and renders each captured preview +
 * approve/reject; there is no card to post (the web stream is text-only).
 * Returns one entry per gated write, or an empty list when the suspension can't
 * be resumed (so the caller can fall back to plain text).
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
}): Promise<
	{ approvalId: string; params: unknown; preview: unknown; toolName: string }[]
> => {
	const requests = approvalRequestsFromOutput(output);
	if (requests.length === 0) return [];
	if (requests.some((request) => !(request.runId && request.toolCallId))) {
		logger.warn("Skipped unexecutable web approval request", {
			event: "leaf.approval_unexecutable_skipped",
			context: { env: output.env, org_id: orgId },
			data: { tools: requests.map((request) => request.toolName) },
		});
		return [];
	}

	const previewed = await Promise.all(
		requests.map((request) =>
			withBackfilledPreview({ logger, request, token }),
		),
	);

	const { groupId, ids } = await chatApprovalRepo.insertGroup({
		db,
		items: previewed.map((request) => ({
			preview: request.preview,
			toolArgs: request.toolArgs,
			toolCallId: request.toolCallId,
			toolName: request.toolName,
		})),
		shared: {
			channelId,
			env: output.env,
			harness,
			orgId,
			provider,
			providerUserId,
			runId: output.runId,
			workspaceId,
		},
	});

	logger.info("Created web approval request", {
		event: "leaf.approval_created",
		context: { env: output.env, org_id: orgId },
		approval_id: groupId,
		data: {
			count: previewed.length,
			tools: previewed.map((request) => request.toolName),
		},
	});

	return previewed.map((request, index) => ({
		approvalId: ids[index],
		params: toolRequestFromArgs(publicToolArgs(request.toolArgs)),
		preview: request.preview,
		toolName: request.toolName,
	}));
};
