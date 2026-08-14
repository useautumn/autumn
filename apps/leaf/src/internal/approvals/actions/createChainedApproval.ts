import type { ChatApproval } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import { approvalOptionIds } from "../../agentRuntime/eve/events.js";
import type { ChainedPendingRequest } from "../../agentRuntime/eve/parkedInput.js";
import type { EveAuthContext } from "../../agentRuntime/eve/types.js";
import { getOrgInstallationToken } from "../../installations/actions/getOrgInstallationToken.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import { fetchApprovalPreview } from "../utils/fetchApprovalPreview.js";
import { toolRequestFromArgs } from "../utils/toolRequest.js";

export const createChainedApproval = async ({
	auth,
	chained,
	providerUserId,
	sessionId,
	siblingRequestIds,
}: {
	auth: EveAuthContext;
	chained: ChainedPendingRequest;
	providerUserId: string;
	sessionId: string;
	siblingRequestIds: ReadonlyArray<string>;
}) => {
	const env = auth.appEnv as ChatApproval["env"];
	const provider = auth.provider as ChatApproval["provider"];
	const options = approvalOptionIds({ options: chained.options });
	let preview: unknown;
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
		preview = await fetchApprovalPreview({
			env,
			logger,
			request: toolRequestFromArgs(chained.input) ?? {},
			token: accessToken,
			toolName: chained.toolName,
		});
	} catch (error) {
		logger.warn("Could not backfill chained approval preview", {
			event: "leaf.eve_chained_preview_backfill_failed",
			tool: chained.toolName,
			data: {
				error: error instanceof Error ? error.message : String(error),
			},
		});
	}
	return chatApprovalRepo.insert({
		db,
		data: {
			channelId: auth.channelId,
			env,
			harness: "eve",
			orgId: auth.orgId,
			preview,
			provider,
			providerUserId,
			runId: sessionId,
			toolArgs: {
				...(chained.input ?? {}),
				_eveApproveOptionId: options.approve,
				_eveDenyOptionId: options.deny,
				_eveSiblingRequestIds: siblingRequestIds,
			},
			toolCallId: chained.requestId,
			toolName: chained.toolName,
			workspaceId: auth.workspaceId,
		},
	});
};
