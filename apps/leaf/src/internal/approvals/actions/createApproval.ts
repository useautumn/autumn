import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv, ChatProvider } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import type { AgentApprovalTurn } from "../../agentRuntime/domain/agentTurn.js";
import {
	childSessionIdsFromToolArgs,
	type WithheldWrite,
	withheldWritesFromToolArgs,
} from "../../agentRuntime/eve/parkedInput.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import { chatApprovalStepsRepo } from "../repos/chatApprovalStepsRepo.js";
import {
	resolveApprovalDisplay,
	withApprovalDisplay,
} from "../utils/approvalDisplay.js";
import {
	resolveApprovalPreview,
	withStepPreviews,
} from "../utils/fetchApprovalPreview.js";
import { publicToolArgs, toolRequestFromArgs } from "../utils/toolRequest.js";

const markerString = (args: Record<string, unknown>, key: string) => {
	const value = args[key];
	return typeof value === "string" ? value : undefined;
};

/** Grouped step previews are N MCP round trips; the card posts without waiting
 * and re-renders when they land. Step updates are pending-guarded (step AND
 * parent) so an already-resolved approval keeps what it was approved with. */
const createStepPreviewBackfill =
	({
		approvalId,
		env,
		getToken,
		logger,
	}: {
		approvalId: string;
		env: AppEnv;
		getToken: () => Promise<string>;
		logger: AutumnLogger;
	}) =>
	async (): Promise<ReadonlyArray<WithheldWrite> | undefined> => {
		const steps = await chatApprovalStepsRepo.list({ approvalId, db });
		const grouped = steps.filter((step) => step.position > 0);
		if (!grouped.length) return undefined;
		const previewed = await withStepPreviews({
			env,
			getToken,
			logger,
			steps: grouped.map((step) => ({
				input: step.tool_args,
				requestId: step.request_id ?? "",
				toolName: step.tool_name,
			})),
		});
		let allStored = true;
		await Promise.all(
			grouped.map(async (step, index) => {
				const stored = await chatApprovalStepsRepo.setPreview({
					approvalId,
					db,
					preview: previewed[index]?.preview,
					stepId: step.id,
				});
				allStored &&= stored;
			}),
		);
		return allStored ? previewed : undefined;
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

	const storedToolArgs = publicToolArgs(approval.toolArgs, {
		includeWithheld: false,
	});
	const request = toolRequestFromArgs(storedToolArgs);
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
	const withheld = withheldWritesFromToolArgs(approval.toolArgs);

	const approvalId = await chatApprovalRepo.insert({
		db,
		data: {
			approveOptionId: markerString(approval.toolArgs, "_eveApproveOptionId"),
			channelId,
			childSessionIds: childSessionIdsFromToolArgs(approval.toolArgs),
			denyOptionId: markerString(approval.toolArgs, "_eveDenyOptionId"),
			env,
			harness: "eve",
			orgId,
			preview,
			provider,
			providerUserId,
			runId: turn.sessionId,
			steps: [
				{
					preview,
					requestId: approval.toolCallId,
					toolArgs: storedToolArgs,
					toolName: approval.toolName,
				},
				...withheld.map((write) => ({
					denyOptionId: write.denyOptionId,
					requestId: write.requestId,
					toolArgs: write.input ?? {},
					toolName: write.toolName,
				})),
			],
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
		backfillGroupedPreviews: withheld.length
			? createStepPreviewBackfill({ approvalId, env, getToken, logger })
			: undefined,
		params: request,
		preview,
		toolArgs: storedToolArgs,
		toolName: approval.toolName,
		withheld,
	} as const;
};
