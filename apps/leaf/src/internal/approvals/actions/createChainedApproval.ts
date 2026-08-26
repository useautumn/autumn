import type { ChatApproval } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import { approvalOptionIds } from "../../agentRuntime/eve/events.js";
import type {
	ChainedPendingRequest,
	WithheldWrite,
} from "../../agentRuntime/eve/parkedInput.js";
import type { EveAuthContext } from "../../agentRuntime/eve/types.js";
import { getOrgInstallationToken } from "../../installations/actions/getOrgInstallationToken.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import {
	resolveApprovalDisplay,
	withApprovalDisplay,
} from "../utils/approvalDisplay.js";
import {
	fetchApprovalPreview,
	isFailedApprovalPreview,
	withWritePreviews,
} from "../utils/fetchApprovalPreview.js";
import { toolRequestFromArgs } from "../utils/toolRequest.js";

export const createChainedApproval = async ({
	auth,
	chained,
	childSessionIds = [],
	providerUserId,
	sessionId,
	withheld = [],
}: {
	auth: EveAuthContext;
	chained: ChainedPendingRequest;
	childSessionIds?: ReadonlyArray<string>;
	providerUserId: string;
	sessionId: string;
	withheld?: ReadonlyArray<WithheldWrite>;
}) => {
	const env = auth.appEnv as ChatApproval["env"];
	const provider = auth.provider as ChatApproval["provider"];
	const options = approvalOptionIds({ options: chained.options });
	let preview: unknown;
	let previewedWithheld = withheld;
	try {
		const credentialUserId =
			provider === "web" ? providerUserId : auth.autumnUserId;
		const { accessToken } = await getOrgInstallationToken({
			env,
			orgId: auth.orgId,
			provider,
			userId: credentialUserId,
			workspaceId: auth.workspaceId,
		});
		const getToken = async () => accessToken;
		const request = toolRequestFromArgs(chained.input) ?? {};
		const resolvedPreview = await fetchApprovalPreview({
			env,
			logger,
			request,
			token: accessToken,
			toolName: chained.toolName,
		});
		if (isFailedApprovalPreview(resolvedPreview)) {
			preview = resolvedPreview;
		} else {
			const display = await resolveApprovalDisplay({
				env,
				getToken,
				preview: resolvedPreview,
				request,
			});
			preview = withApprovalDisplay({ display, preview: resolvedPreview });
		}
		if (withheld.length) {
			previewedWithheld = await withWritePreviews({
				env,
				getToken,
				logger,
				writes: withheld,
			});
		}
	} catch (error) {
		logger.warn("Could not backfill chained approval preview", {
			event: "leaf.eve_chained_preview_backfill_failed",
			tool: chained.toolName,
			data: {
				error,
			},
		});
	}
	const toolArgs: Record<string, unknown> = { ...(chained.input ?? {}) };
	return chatApprovalRepo.insert({
		db,
		data: {
			approveOptionId: options.approve,
			channelId: auth.channelId,
			childSessionIds,
			denyOptionId: options.deny,
			env,
			harness: "eve",
			orgId: auth.orgId,
			preview,
			provider,
			providerUserId,
			runId: sessionId,
			groupedWrites: previewedWithheld.map((write) => ({
				denyOptionId: write.denyOptionId,
				preview: write.preview,
				requestId: write.requestId,
				toolArgs: write.input ?? {},
				toolName: write.toolName,
			})),
			toolArgs,
			toolCallId: chained.requestId,
			toolName: chained.toolName,
			workspaceId: auth.workspaceId,
		},
	});
};
