import type { AutumnLogger } from "@autumn/logging";
import type { ChatApproval, ChatInstallation } from "@autumn/shared";
import { toolLabel } from "../../../../agent/tools/toolPolicy.js";
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
import {
	type ApprovalRequest,
	approvalRequestsFromOutput,
} from "../../utils/approvalRequest.js";
import {
	fetchApprovalPreview,
	shouldRefreshApprovalPreview,
} from "../../utils/fetchApprovalPreview.js";
import { approvalCardItems, publicToolArgs } from "./cardItems.js";

const getRequest = (args?: Record<string, unknown>) =>
	args?.request && typeof args.request === "object"
		? (args.request as Record<string, unknown>)
		: args;

/** Posts the card for approvals that already exist (chained writes surfaced by
 * an approve/answer resume, which never flow through `presentApproval`). */
export const postApprovalCardForGroup = async ({
	approvals,
	logger = rootLogger,
	target,
}: {
	approvals: ChatApproval[];
	logger?: AutumnLogger;
	/** Structural post-only view so ActionEvent threads (unknown state generic) fit. */
	target: { post: (message: unknown) => Promise<{ id: string }> };
}) => {
	const [first] = approvals;
	if (!first) return;
	const sent = await target.post(
		approvalCard({
			id: first.id,
			env: first.env,
			items: approvalCardItems(approvals),
			requesterId: first.provider_user_id,
		}),
	);
	// Stored on the clicked row so a later turn can replace the card.
	try {
		await chatApprovalRepo.setMessageTs({
			approvalId: first.id,
			db,
			messageTs: sent.id,
		});
	} catch (error) {
		logger.warn("Could not store chained approval message id", {
			event: "leaf.approval_message_ts_failed",
			approval_id: first.id,
			error,
		});
	}
};

/** Backfills the money facts for a write whose preview wasn't captured. Every
 * gated call has to show its own cost — an approver must never see another
 * customer's number next to this one's arguments. */
const withBackfilledPreview = async ({
	installation,
	logger,
	orgId,
	request,
}: {
	installation: ChatInstallation;
	logger: AutumnLogger;
	orgId: string;
	request: ApprovalRequest;
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
		const token = await getInstallationOAuthAccessToken({
			installation,
			env: request.env,
			orgId,
		});
		const body = getRequest(publicToolArgs(request.toolArgs));
		if (!body) return request;
		const preview = await fetchApprovalPreview({
			env: request.env,
			logger,
			request: body,
			token,
			toolName: request.toolName,
		});
		return preview ? { ...request, preview } : request;
	} catch (error) {
		logger.warn("Could not backfill approval preview", {
			event: "leaf.approval_preview_backfill_failed",
			tool: request.toolName,
			error,
		});
		return request;
	}
};

/** Posts one approval card when the agent output suspended on gated writes. */
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
	const requests = approvalRequestsFromOutput(output);
	if (requests.length === 0) return false;

	// resolveApprovalGroup can only confirm suspended session tools, so a card
	// missing either id would always fail at approval time — fall back to text.
	if (requests.some((request) => !(request.runId && request.toolCallId))) {
		logger.warn("Skipped unexecutable approval request", {
			event: "leaf.approval_unexecutable_skipped",
			context: { env: output.env, org_id: orgId },
			data: { tools: requests.map((request) => request.toolName) },
		});
		return false;
	}

	// Catalog decisions change write args, so refresh against the exact request;
	// other writes only backfill when their preview is absent.
	const previewed = await Promise.all(
		requests.map((request) =>
			withBackfilledPreview({ installation, logger, orgId, request }),
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
			harness: chatEnv.SLACK_AGENT_HARNESS,
			orgId,
			provider: installation.provider,
			providerUserId,
			runId: output.runId,
			workspaceId: installation.workspace_id,
		},
	});

	await logAction(
		previewed.length > 1
			? `Waiting for approval: ${previewed.length} changes`
			: `Waiting for approval: ${toolLabel(previewed[0].toolName)}`,
	);
	logger.info("Created approval request", {
		event: "leaf.approval_created",
		context: { env: output.env, org_id: orgId },
		approval_id: groupId,
		data: {
			count: previewed.length,
			tools: previewed.map((request) => request.toolName),
		},
	});
	await finishLoading(target, loading, "Preview ready.");

	// One message: the agent's preview prose rides inside the card.
	const sent = await target.post(
		approvalCard({
			id: ids[0],
			env: output.env,
			items: previewed.map((request) => ({
				preview: request.preview,
				toolArgs: publicToolArgs(request.toolArgs),
				toolName: request.toolName,
			})),
			requesterId: providerUserId,
			summary: output.text,
		}),
	);

	// Stored so a later turn can replace the card if it goes stale.
	try {
		await chatApprovalRepo.setMessageTs({
			approvalId: ids[0],
			db,
			messageTs: sent.id,
		});
	} catch (error) {
		logger.warn("Could not store approval message id", {
			event: "leaf.approval_message_ts_failed",
			approval_id: ids[0],
			error,
		});
	}
	return true;
};
