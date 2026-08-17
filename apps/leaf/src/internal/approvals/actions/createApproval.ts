import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv, ChatProvider } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import type { AgentApprovalTurn } from "../../agentRuntime/domain/agentTurn.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import {
	fetchApprovalPreview,
	shouldRefreshApprovalPreview,
} from "../utils/fetchApprovalPreview.js";
import { publicToolArgs, toolRequestFromArgs } from "../utils/toolRequest.js";

const resolveApprovalPreview = async ({
	env,
	getToken,
	logger,
	preview,
	request,
	toolName,
}: {
	env: AppEnv;
	getToken: () => Promise<string>;
	logger: AutumnLogger;
	preview: unknown;
	request?: Record<string, unknown>;
	toolName: string;
}) => {
	if (!request || !shouldRefreshApprovalPreview({ preview, toolName })) {
		return preview;
	}
	try {
		const fetchedPreview = await fetchApprovalPreview({
			env,
			logger,
			request,
			token: await getToken(),
			toolName,
		});
		return fetchedPreview ? fetchedPreview : preview;
	} catch (error) {
		logger.warn("Could not backfill approval preview", {
			event: "leaf.approval_preview_backfill_failed",
			error,
			tool: toolName,
		});
		return preview;
	}
};

export const createApproval = async ({
	channelId,
	env,
	getToken,
	logger,
	orgId,
	provider,
	providerUserId,
	turn,
	workspaceId,
}: {
	channelId: string;
	env: AppEnv;
	getToken: () => Promise<string>;
	logger: AutumnLogger;
	orgId: string;
	provider: ChatProvider;
	providerUserId: string;
	turn: AgentApprovalTurn;
	workspaceId: string;
}) => {
	const approval = turn.approval;
	if (!approval.toolCallId) {
		logger.warn("Skipped unexecutable approval request", {
			event: "leaf.approval_unexecutable_skipped",
			context: { env, org_id: orgId },
			tool: approval.toolName,
		});
		return undefined;
	}

	const toolArgs = publicToolArgs(approval.toolArgs);
	const request = toolRequestFromArgs(toolArgs);
	const preview = await resolveApprovalPreview({
		env,
		getToken,
		logger,
		preview: approval.preview,
		request,
		toolName: approval.toolName,
	});

	const approvalId = await chatApprovalRepo.insert({
		db,
		data: {
			channelId,
			env,
			harness: "eve",
			orgId,
			preview,
			provider,
			providerUserId,
			runId: turn.sessionId,
			toolArgs: approval.toolArgs,
			toolCallId: approval.toolCallId,
			toolName: approval.toolName,
			workspaceId,
		},
	});
	logger.info("Created approval request", {
		event: "leaf.approval_created",
		context: { env, org_id: orgId },
		approval_id: approvalId,
		tool: approval.toolName,
	});
	return {
		approvalId,
		params: request,
		preview,
		toolArgs,
		toolName: approval.toolName,
	} as const;
};
