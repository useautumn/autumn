import type { ChatApproval } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import { APPROVAL_NOT_EXECUTED_MESSAGE } from "../../../ui/messages.js";
import { submitAgentInput } from "../../agentRuntime/actions/submitAgentInput/submitAgentInput.js";
import { siblingRequestIdsFromToolArgs } from "../../agentRuntime/eve/parkedInput.js";
import { getEveSessionBySessionId } from "../../agentRuntime/eve/repo.js";
import type { EveAuthContext } from "../../agentRuntime/eve/types.js";
import type { ApprovalRunResult } from "../types.js";
import { createChainedApproval } from "./createChainedApproval.js";

const approvalAuth = ({
	approval,
	providerUserId,
}: {
	approval: ChatApproval;
	providerUserId: string;
}): EveAuthContext => ({
	appEnv: approval.env,
	channelId: approval.channel_id,
	orgId: approval.org_id,
	provider: approval.provider,
	providerUserId,
	threadId: approval.channel_id,
	workspaceId: approval.workspace_id,
});

export const submitApprovalInput = async ({
	approval,
	expectExecution,
	note,
	optionId,
	providerUserId,
}: {
	approval: ChatApproval;
	expectExecution?: boolean;
	note?: string;
	optionId: string;
	providerUserId: string;
}): Promise<ApprovalRunResult> => {
	if (!(approval.run_id && approval.tool_call_id)) {
		return {
			error: true,
			message: "Eve approval is missing session state.",
			retryable: false,
		};
	}
	const session = await getEveSessionBySessionId({
		db,
		orgId: approval.org_id,
		sessionId: approval.run_id,
	});
	if (!session) {
		return {
			error: true,
			message: "Eve session not found.",
			retryable: true,
		};
	}
	const auth = approvalAuth({ approval, providerUserId });
	const {
		chained,
		chainedSiblingRequestIds,
		deferredEmptyTurn,
		question,
		text,
	} = await submitAgentInput({
		auth,
		note,
		optionId,
		orgId: approval.org_id,
		requestId: approval.tool_call_id,
		session,
		siblingRequestIds: siblingRequestIdsFromToolArgs(approval.tool_args),
	});
	const chainedApprovalId = chained
		? await createChainedApproval({
				auth,
				chained,
				providerUserId,
				sessionId: session.sessionId,
				siblingRequestIds: chainedSiblingRequestIds,
			})
		: undefined;
	if (expectExecution && deferredEmptyTurn) {
		logger.error("Approved Eve action was not executed", undefined, {
			event: "leaf.eve_approval_not_executed",
			approval_id: approval.id,
			data: { session_id: session.sessionId, tool: approval.tool_name },
		});
		return {
			error: true,
			message: APPROVAL_NOT_EXECUTED_MESSAGE,
			retryable: true,
		};
	}
	return {
		chainedApprovalId,
		question: question
			? { ...question, sessionId: session.sessionId }
			: undefined,
		result: {},
		text,
		toolName: approval.tool_name,
	};
};
