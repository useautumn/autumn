import type { AutumnLogger } from "@autumn/logging";
import type { ChatApproval, ChatInstallation } from "@autumn/shared";
import {
	normalizeToolName,
	toolLabel,
} from "../../../../agent/tools/toolPolicy.js";
import { db } from "../../../../lib/db.js";
import { env as chatEnv } from "../../../../lib/env.js";
import { logger as rootLogger } from "../../../../lib/logger.js";
import type { AgentOutput } from "../../../../types.js";
import { approvalCard } from "../../../../ui/blocks.js";
import {
	finishLoading,
	type LoadingState,
	type ReplyTarget,
} from "../../../../ui/progress.js";
import { getInstallationOAuthAccessToken } from "../../../installations/actions/getInstallationOAuthAccessToken.js";
import { chatApprovalRepo } from "../../repos/chatApprovalRepo.js";
import { approvalRequestFromOutput } from "../../utils/approvalRequest.js";
import { fetchApprovalPreview } from "../../utils/fetchApprovalPreview.js";

const getRequest = (args?: Record<string, unknown>) =>
	args?.request && typeof args.request === "object"
		? (args.request as Record<string, unknown>)
		: args;

const publicToolArgs = (args: Record<string, unknown>) =>
	Object.fromEntries(
		Object.entries(args).filter(([key]) => !key.startsWith("_eve")),
	);

/** Posts the card for an approval row that already exists (a chained write
 * surfaced by an approve/answer resume, which never flows through
 * `presentApproval`). */
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

/** Posts an approval card when the agent output suspended on a destructive tool. */
export const presentApproval = async ({
	channelId,
	installation,
	loading,
	logAction,
	logger = rootLogger,
	orgId,
	output,
	providerUserId,
	target,
}: {
	channelId: string;
	installation: ChatInstallation;
	loading: LoadingState;
	logAction: (message: string) => Promise<void> | void;
	logger?: AutumnLogger;
	orgId: string;
	output: AgentOutput;
	providerUserId: string;
	target: ReplyTarget;
}) => {
	const approval = approvalRequestFromOutput(output);
	if (!approval) return false;

	// resolveApproval can only confirm a suspended session tool, so a card missing
	// either id would always fail at approval time — fall back to plain text.
	if (!approval.runId || !approval.toolCallId) {
		logger.warn("Skipped unexecutable approval request", {
			event: "leaf.approval_unexecutable_skipped",
			context: { env: approval.env, org_id: orgId },
			tool: approval.toolName,
		});
		return false;
	}

	// Suspended without a fresh preview (it ran in an earlier turn) — fetch
	// one so the card always carries the money facts.
	if (
		!approval.preview ||
		normalizeToolName(approval.toolName) === "updatePlan"
	) {
		try {
			const token = await getInstallationOAuthAccessToken({
				installation,
				env: approval.env,
				orgId,
			});
			const request = getRequest(publicToolArgs(approval.toolArgs));
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
			env: approval.env,
			harness: chatEnv.SLACK_AGENT_HARNESS,
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
			org_id: orgId,
		},
		approval_id: approvalId,
		tool: approval.toolName,
	});
	await finishLoading(target, loading, "Preview ready.");

	// One message: the agent's preview prose rides inside the card.
	const sent = await target.post(
		approvalCard({
			id: approvalId,
			env: approval.env,
			preview: approval.preview,
			requesterId: providerUserId,
			summary: output.text,
			toolArgs: publicToolArgs(approval.toolArgs),
			toolName: approval.toolName,
		}),
	);

	// Stored so a later turn can replace the card if it goes stale.
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
