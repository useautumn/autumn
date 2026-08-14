import type { AutumnLogger } from "@autumn/logging";
import type { ChatApproval, ChatInstallation } from "@autumn/shared";
import { toolLabel } from "../../../../agent/tools/toolPolicy.js";
import type { AgentApprovalTurn } from "../../../agentRuntime/domain/agentTurn.js";
import { db } from "../../../../lib/db.js";
import { logger as rootLogger } from "../../../../lib/logger.js";
import { approvalCard } from "../../../../ui/blocks.js";
import type { ReplyTarget } from "../../../../ui/progress.js";
import { getInstallationOAuthAccessToken } from "../../../installations/actions/getInstallationOAuthAccessToken.js";
import { chatApprovalRepo } from "../../repos/chatApprovalRepo.js";
import {
	fetchApprovalPreview,
	shouldRefreshApprovalPreview,
} from "../../utils/fetchApprovalPreview.js";
import {
	publicToolArgs,
	toolRequestFromArgs,
} from "../../utils/toolRequest.js";

export const postApprovalCardForRow = async ({
	approval,
	logger = rootLogger,
	target,
}: {
	approval: ChatApproval;
	logger?: AutumnLogger;
	/** Structural post-only view so ActionEvent threads (unknown state generic) fit. */
	target: { post: (message: unknown) => Promise<{ id: string }> };
}) => {
	const toolArgs =
		approval.tool_args && typeof approval.tool_args === "object"
			? (approval.tool_args as Record<string, unknown>)
			: {};
	const sent = await target.post(
		approvalCard({
			id: approval.id,
			env: approval.env,
			preview: approval.preview ?? undefined,
			requesterId: approval.provider_user_id,
			toolArgs: publicToolArgs(toolArgs),
			toolName: approval.tool_name,
		}),
	);
	try {
		await chatApprovalRepo.setMessageTs({
			approvalId: approval.id,
			db,
			messageTs: sent.id,
		});
	} catch (error) {
		logger.warn("Could not store chained approval message id", {
			event: "leaf.approval_message_ts_failed",
			approval_id: approval.id,
			error,
		});
	}
};

export const presentApproval = async ({
	channelId,
	installation,
	logAction,
	logger = rootLogger,
	orgId,
	env,
	providerUserId,
	target,
	turn,
}: {
	channelId: string;
	env: ChatApproval["env"];
	installation: ChatInstallation;
	logAction: (message: string) => Promise<void> | void;
	logger?: AutumnLogger;
	orgId: string;
	providerUserId: string;
	target: ReplyTarget;
	turn: AgentApprovalTurn;
}) => {
	const approval = turn.approval;
	let preview = approval.preview;

	if (!approval.toolCallId) {
		logger.warn("Skipped unexecutable approval request", {
			event: "leaf.approval_unexecutable_skipped",
			context: { env, org_id: orgId },
			tool: approval.toolName,
		});
		return false;
	}

	if (
		shouldRefreshApprovalPreview({
			preview,
			toolName: approval.toolName,
		})
	) {
		try {
			const token = await getInstallationOAuthAccessToken({
				installation,
				env,
				orgId,
			});
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
			logger.warn("Could not backfill approval preview", {
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
			provider: installation.provider,
			workspaceId: installation.workspace_id,
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

	await logAction(`Waiting for approval: ${toolLabel(approval.toolName)}`);
	logger.info("Created approval request", {
		event: "leaf.approval_created",
		context: {
			env,
			org_id: orgId,
		},
		approval_id: approvalId,
		tool: approval.toolName,
	});
	const sent = await target.post(
		approvalCard({
			id: approvalId,
			env,
			preview,
			requesterId: providerUserId,
			summary: turn.text,
			toolArgs: publicToolArgs(approval.toolArgs),
			toolName: approval.toolName,
		}),
	);

	try {
		await chatApprovalRepo.setMessageTs({
			approvalId,
			db,
			messageTs: sent.id,
		});
	} catch (error) {
		logger.warn("Could not store approval message id", {
			event: "leaf.approval_message_ts_failed",
			approval_id: approvalId,
			error,
		});
	}
	return true;
};
