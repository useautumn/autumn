import type { ChatApproval } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import {
	ACTION_FAILED_MESSAGE,
	APPROVAL_NOT_EXECUTED_MESSAGE,
} from "../../../ui/messages.js";
import { submitAgentInput } from "../../agentRuntime/actions/submitAgentInput/submitAgentInput.js";
import {
	childSessionIdsFromToolArgs,
	siblingRequestIdsFromToolArgs,
	withheldWritesFromToolArgs,
} from "../../agentRuntime/eve/parkedInput.js";
import { getEveSessionBySessionId } from "../../agentRuntime/eve/repo.js";
import type { EveAuthContext } from "../../agentRuntime/eve/types.js";
import { isInternalAutumnSlackProvider } from "../../slackAdmin/provider.js";
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

/** Slack cards render every write in a parked batch, so approving the card
 * approves the group; the dashboard shows the primary write alone. Internal
 * Slack threads use the `slack_admin:<client>` provider and the same card. */
const surfaceRendersGroup = (provider: string) =>
	provider === "slack" || isInternalAutumnSlackProvider({ provider });

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
		logger.warn("Approval is missing Eve session state", {
			event: "leaf.approval_session_missing",
			approval_id: approval.id,
			data: { org_id: approval.org_id, tool: approval.tool_name },
		});
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
		// Retryable, so the row returns to pending — the "button does nothing"
		// symptom starts here.
		logger.warn("Eve session not found for approval", {
			event: "leaf.approval_eve_session_not_found",
			approval_id: approval.id,
			data: {
				org_id: approval.org_id,
				run_id: approval.run_id,
				tool: approval.tool_name,
			},
		});
		return {
			error: true,
			message: "Eve session not found.",
			retryable: true,
		};
	}
	const startedAt = Date.now();
	const auth = approvalAuth({ approval, providerUserId });
	const siblingRequestIds = siblingRequestIdsFromToolArgs(approval.tool_args);
	const approvalLogData = {
		session_id: session.sessionId,
		tool: approval.tool_name,
	};
	const {
		approvedWriteFailed,
		approvedWriteUnverified,
		chained,
		chainedSiblingRequestIds,
		chainedWithheld,
		deferredEmptyTurn,
		steps,
		question,
		text,
	} = await submitAgentInput({
		auth,
		// Only a surface that rendered the whole group may approve it; the
		// dashboard shows the primary write alone, so its siblings stay withheld.
		approveSiblings: expectExecution && surfaceRendersGroup(approval.provider),
		childSessionIds: childSessionIdsFromToolArgs(approval.tool_args),
		expectedToolNames: expectExecution
			? [
					approval.tool_name,
					...withheldWritesFromToolArgs(approval.tool_args).map(
						(write) => write.toolName,
					),
				]
			: undefined,
		note,
		optionId,
		orgId: approval.org_id,
		requestId: approval.tool_call_id,
		session,
		siblingRequestIds,
	});
	const chainedApprovalId = chained
		? await createChainedApproval({
				auth,
				chained,
				providerUserId,
				sessionId: session.sessionId,
				siblingRequestIds: chainedSiblingRequestIds,
				withheld: chainedWithheld,
			})
		: undefined;
	// Eve may execute the approved call before the resumed stream opens, so a
	// turn that did real work without echoing the result still counts as run.
	const settled = !(chained || question);
	const notExecuted =
		expectExecution &&
		(deferredEmptyTurn || (settled && approvedWriteUnverified && !text));
	if (expectExecution && approvedWriteFailed) {
		logger.error("Approved Eve action failed", undefined, {
			event: "leaf.eve_approval_failed",
			approval_id: approval.id,
			data: approvalLogData,
		});
		return {
			chainedApprovalId,
			error: true,
			message: text || ACTION_FAILED_MESSAGE,
			retryable: false,
			steps,
		};
	}
	if (notExecuted) {
		logger.error("Approved Eve action was not executed", undefined, {
			event: "leaf.eve_approval_not_executed",
			approval_id: approval.id,
			data: approvalLogData,
		});
		return {
			error: true,
			message: APPROVAL_NOT_EXECUTED_MESSAGE,
			retryable: true,
		};
	}
	if (expectExecution) {
		logger.info("Approved action applied", {
			event: "leaf.approval_applied",
			approval_id: approval.id,
			data: {
				...approvalLogData,
				chained_approval_id: chainedApprovalId,
				duration_ms: Date.now() - startedAt,
				sibling_count: siblingRequestIds.length,
				verified: !approvedWriteUnverified,
			},
		});
	}
	return {
		chainedApprovalId,
		question: question
			? { ...question, sessionId: session.sessionId }
			: undefined,
		result: {},
		steps,
		text,
		toolName: approval.tool_name,
	};
};
