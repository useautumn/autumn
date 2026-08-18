import type { AutumnLogger } from "@autumn/logging";
import type { ChatApproval, ChatInstallation } from "@autumn/shared";
import { toolLabel } from "../../../agentRuntime/tools/toolPolicy.js";
import type { AgentApprovalTurn } from "../../../agentRuntime/domain/agentTurn.js";
import { db } from "../../../../lib/db.js";
import { logger as rootLogger } from "../../../../lib/logger.js";
import { approvalCard } from "../../../../ui/blocks.js";
import type { ReplyTarget } from "../../../../ui/progress.js";
import { getInstallationOAuthAccessToken } from "../../../installations/actions/getInstallationOAuthAccessToken.js";
import { createApproval } from "../../actions/createApproval.js";
import { chatApprovalRepo } from "../../repos/chatApprovalRepo.js";
import { publicToolArgs } from "../../utils/toolRequest.js";

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
	const created = await createApproval({
		channelId,
		env,
		getToken: () =>
			getInstallationOAuthAccessToken({ installation, env, orgId }),
		logger,
		orgId,
		provider: installation.provider,
		providerUserId,
		turn,
		workspaceId: installation.workspace_id,
	});
	if (!created) return false;

	await logAction(`Waiting for approval: ${toolLabel(created.toolName)}`);
	const sent = await target.post(
		approvalCard({
			id: created.approvalId,
			env,
			preview: created.preview,
			requesterId: providerUserId,
			summary: turn.text,
			toolArgs: created.toolArgs,
			toolName: created.toolName,
		}),
	);

	try {
		await chatApprovalRepo.setMessageTs({
			approvalId: created.approvalId,
			db,
			messageTs: sent.id,
		});
	} catch (error) {
		logger.warn("Could not store approval message id", {
			event: "leaf.approval_message_ts_failed",
			approval_id: created.approvalId,
			error,
		});
	}
	return true;
};
