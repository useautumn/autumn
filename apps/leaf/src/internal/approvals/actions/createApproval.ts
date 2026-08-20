import type { AutumnLogger } from "@autumn/logging";
import { parsePreviewPayload } from "@autumn/render";
import type { AppEnv, ChatProvider } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import type { AgentApprovalTurn } from "../../agentRuntime/domain/agentTurn.js";
import { withheldWritesFromToolArgs } from "../../agentRuntime/eve/parkedInput.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import {
	resolveApprovalDisplay,
	withApprovalDisplay,
} from "../utils/approvalDisplay.js";
import {
	resolveApprovalPreview,
	withGroupedWritePreviews,
} from "../utils/fetchApprovalPreview.js";
import { publicToolArgs, toolRequestFromArgs } from "../utils/toolRequest.js";

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

	const request = toolRequestFromArgs(publicToolArgs(approval.toolArgs));
	const resolvedPreview = await resolveApprovalPreview({
		env,
		getToken,
		logger,
		preview: approval.preview,
		request,
		toolName: approval.toolName,
	});
	const display = await resolveApprovalDisplay({
		env,
		getToken,
		preview: resolvedPreview,
		request,
	});
	const preview = withApprovalDisplay({ display, preview: resolvedPreview });
	const storedToolArgs = approval.toolArgs;

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
			toolArgs: storedToolArgs,
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
	// Grouped step previews are N MCP round trips; the card posts without
	// waiting and re-renders when they land. The row update is pending-guarded
	// so an already-resolved approval keeps what it was approved with.
	const backfillGroupedPreviews =
		withheldWritesFromToolArgs(approval.toolArgs).length === 0
			? undefined
			: async () => {
					const enriched = await withGroupedWritePreviews({
						env,
						getToken,
						logger,
						toolArgs: approval.toolArgs,
					});
					const stored = await chatApprovalRepo.setToolArgs({
						approvalId,
						db,
						toolArgs: enriched,
					});
					return stored ? publicToolArgs(enriched) : undefined;
				};

	return {
		approvalId,
		backfillGroupedPreviews,
		params: request,
		preview,
		toolArgs: publicToolArgs(storedToolArgs),
		toolName: approval.toolName,
	} as const;
};
