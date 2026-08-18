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
	FAILED_APPROVAL_PREVIEW,
	fetchApprovalPreview,
	isFailedApprovalPreview,
	shouldRefreshApprovalPreview,
} from "../utils/fetchApprovalPreview.js";
import { publicToolArgs, toolRequestFromArgs } from "../utils/toolRequest.js";

/** Each grouped write gets the same preview + display backfill as the primary
 * one, so the card can render every step with the standard body. */
const withGroupedWritePreviews = async ({
	env,
	getToken,
	logger,
	toolArgs,
}: {
	env: AppEnv;
	getToken: () => Promise<string>;
	logger: AutumnLogger;
	toolArgs: Record<string, unknown>;
}) => {
	const withheld = withheldWritesFromToolArgs(toolArgs);
	if (!withheld.length) return toolArgs;
	const resolved = await Promise.all(
		withheld.map(async (write) => {
			const request = toolRequestFromArgs(write.input);
			// The primary write's preview is parsed at capture time; a backfilled
			// one arrives as the raw MCP envelope and needs the same treatment.
			const preview = parsePreviewPayload(
				await resolveApprovalPreview({
					env,
					getToken,
					logger,
					preview: undefined,
					request,
					toolName: write.toolName,
				}),
			);
			const display = await resolveApprovalDisplay({
				env,
				getToken,
				preview,
				request,
			});
			return {
				...write,
				preview: withApprovalDisplay({ display, preview }),
			};
		}),
	);
	return { ...toolArgs, _eveWithheldWrites: resolved };
};

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
		if (isFailedApprovalPreview(fetchedPreview)) {
			return preview ?? FAILED_APPROVAL_PREVIEW;
		}
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
	// Enrich the raw args so the stored row keeps both the harness transport
	// keys (approve/deny ids, sibling ids) and the backfilled step previews;
	// every later card render reads from the row.
	const storedToolArgs = await withGroupedWritePreviews({
		env,
		getToken,
		logger,
		toolArgs: approval.toolArgs,
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
	return {
		approvalId,
		params: request,
		preview,
		toolArgs: publicToolArgs(storedToolArgs),
		toolName: approval.toolName,
	} as const;
};
