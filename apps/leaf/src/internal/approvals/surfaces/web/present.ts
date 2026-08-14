import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv, ChatProvider } from "@autumn/shared";
import type { AgentApprovalTurn } from "../../../agentRuntime/domain/agentTurn.js";
import { db } from "../../../../lib/db.js";
import { logger as rootLogger } from "../../../../lib/logger.js";
import { chatApprovalRepo } from "../../repos/chatApprovalRepo.js";
import {
	fetchApprovalPreview,
	shouldRefreshApprovalPreview,
} from "../../utils/fetchApprovalPreview.js";
import {
	publicToolArgs,
	toolRequestFromArgs,
} from "../../utils/toolRequest.js";

export const presentWebApproval = async ({
	channelId,
	env,
	logger = rootLogger,
	orgId,
	provider,
	providerUserId,
	token,
	turn,
	workspaceId,
}: {
	channelId: string;
	env: AppEnv;
	logger?: AutumnLogger;
	orgId: string;
	provider: ChatProvider;
	providerUserId: string;
	token: string;
	turn: AgentApprovalTurn;
	workspaceId: string;
}): Promise<
	| { approvalId: string; params: unknown; preview: unknown; toolName: string }
	| undefined
> => {
	const approval = turn.approval;
	let preview = approval.preview;
	if (!approval.toolCallId) {
		logger.warn("Skipped unexecutable web approval request", {
			event: "leaf.approval_unexecutable_skipped",
			context: { env, org_id: orgId },
			tool: approval.toolName,
		});
		return undefined;
	}

	if (
		shouldRefreshApprovalPreview({
			preview,
			toolName: approval.toolName,
		})
	) {
		try {
			const request = toolRequestFromArgs(publicToolArgs(approval.toolArgs));
			if (request) {
				const fetchedPreview = await fetchApprovalPreview({
					env,
					logger,
					request,
					token,
					toolName: approval.toolName,
				});
				if (fetchedPreview) preview = fetchedPreview;
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
			env,
			harness: "eve",
			preview,
			runId: turn.sessionId,
			toolArgs: approval.toolArgs,
			toolCallId: approval.toolCallId,
			toolName: approval.toolName,
		},
	});

	logger.info("Created web approval request", {
		event: "leaf.approval_created",
		context: { env, org_id: orgId },
		approval_id: approvalId,
		tool: approval.toolName,
	});

	return {
		approvalId,
		params: toolRequestFromArgs(publicToolArgs(approval.toolArgs)),
		preview,
		toolName: approval.toolName,
	};
};
