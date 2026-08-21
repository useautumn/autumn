import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv, ChatProvider } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import type { AgentApprovalTurn } from "../../agentRuntime/domain/agentTurn.js";
import {
	childSessionIdsFromToolArgs,
	type WithheldWrite,
	withheldWritesFromToolArgs,
} from "../../agentRuntime/eve/parkedInput.js";
import { markerString } from "../domain/approvalRecord.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import { chatApprovalWritesRepo } from "../repos/chatApprovalWritesRepo.js";
import {
	resolveApprovalDisplay,
	withApprovalDisplay,
} from "../utils/approvalDisplay.js";
import {
	resolveApprovalPreview,
	withWritePreviews,
} from "../utils/fetchApprovalPreview.js";
import { publicToolArgs, toolRequestFromArgs } from "../utils/toolRequest.js";

/** Grouped write previews are N MCP round trips; the card posts without waiting
 * and re-renders when they land. Step updates are pending-guarded (write AND
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
		const writes = await chatApprovalWritesRepo.list({ approvalId, db });
		const grouped = writes.filter((write) => write.position > 0);
		if (!grouped.length) return undefined;
		const previewed = await withWritePreviews({
			env,
			getToken,
			logger,
			writes: grouped.map((write) => ({
				input: write.tool_args,
				requestId: write.request_id ?? "",
				toolName: write.tool_name,
			})),
		});
		let allStored = true;
		await Promise.all(
			grouped.map(async (write, index) => {
				const stored = await chatApprovalWritesRepo.setPreview({
					approvalId,
					db,
					preview: previewed[index]?.preview,
					writeId: write.id,
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
			groupedWrites: withheld.map((write) => ({
				denyOptionId: write.denyOptionId,
				requestId: write.requestId,
				toolArgs: write.input ?? {},
				toolName: write.toolName,
			})),
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
