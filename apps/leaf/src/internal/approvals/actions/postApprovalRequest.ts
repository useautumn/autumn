import type { AutumnLogger } from "@autumn/logging";
import type { ChatInstallation } from "@autumn/shared";
import { toolLabel } from "../../../agent/tools/toolPolicy.js";
import { db } from "../../../lib/db.js";
import { logger as rootLogger } from "../../../lib/logger.js";
import type { AgentOutput } from "../../../types.js";
import { approvalCard } from "../../../ui/blocks.js";
import {
	finishLoading,
	type LoadingState,
	type ReplyTarget,
} from "../../../ui/progress.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import { approvalRequestFromOutput } from "../utils/approvalRequest.js";

/** Posts an approval card when the agent output suspended on a destructive tool. */
export const postApprovalRequest = async ({
	channelId,
	installation,
	loading,
	logAction,
	logger = rootLogger,
	output,
	providerUserId,
	target,
}: {
	channelId: string;
	installation: ChatInstallation;
	loading: LoadingState;
	logAction: (message: string) => Promise<void> | void;
	logger?: AutumnLogger;
	output: AgentOutput;
	providerUserId: string;
	target: ReplyTarget;
}) => {
	const approval = approvalRequestFromOutput(output);
	if (!approval) return false;

	// approveAndRun can only confirm a suspended session tool, so a card missing
	// either id would always fail at approval time — fall back to plain text.
	if (!approval.runId || !approval.toolCallId) {
		logger.warn("Skipped unexecutable approval request", {
			event: "leaf.approval_unexecutable_skipped",
			context: { env: approval.env, org_id: installation.org_id },
			tool: approval.toolName,
		});
		return false;
	}

	const approvalId = await chatApprovalRepo.insert({
		db,
		data: {
			orgId: installation.org_id,
			provider: installation.provider,
			workspaceId: installation.workspace_id,
			channelId,
			providerUserId,
			env: approval.env,
			preview: approval.preview,
			runId: approval.runId,
			toolArgs: approval.toolArgs,
			toolCallId: approval.toolCallId,
			toolName: approval.toolName,
		},
	});

	await logAction(`Waiting for approval: ${toolLabel(approval.toolName)}`);
	logger.info("Created approval request", {
		event: "leaf.approval_created",
		context: {
			env: approval.env,
			org_id: installation.org_id,
		},
		approval_id: approvalId,
		tool: approval.toolName,
	});
	await finishLoading(target, loading, "Preview ready.");
	await target.post(
		approvalCard({
			id: approvalId,
			env: approval.env,
			toolName: approval.toolName,
			toolArgs: approval.toolArgs,
			preview: approval.preview,
		}),
	);
	return true;
};
