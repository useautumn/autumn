import type { ChatApproval } from "@autumn/shared";
import { db as chatDb, db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import {
	ACTION_FAILED_MESSAGE,
	APPROVAL_NOT_EXECUTED_MESSAGE,
} from "../../../ui/messages.js";
import { submitAgentInput } from "../../agentRuntime/actions/submitAgentInput/submitAgentInput.js";
import { postEveInputResponse } from "../../agentRuntime/eve/client.js";
import { approvalOptionIds } from "../../agentRuntime/eve/events.js";
import { getEveSessionBySessionId } from "../../agentRuntime/eve/repo.js";
import type { EveAuthContext } from "../../agentRuntime/eve/types.js";
import {
	childSessionIdsOf,
	siblingRequestIdsOf,
	surfaceRendersGroup,
	withheldStepsOf,
} from "../domain/approvalRecord.js";
import { chatApprovalStepsRepo } from "../repos/chatApprovalStepsRepo.js";
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
	shouldAbsorbChained,
	siblingOptionIdFor,
	suppressSiblingWithheldNote,
}: {
	approval: ChatApproval;
	expectExecution?: boolean;
	note?: string;
	optionId: string;
	providerUserId: string;
	/** Absorbs a re-issued duplicate of an already-applied write: returns the
	 * deny note when the chained park should be auto-denied instead of carded. */
	shouldAbsorbChained?: (chained: {
		input?: Record<string, unknown>;
		toolName: string;
	}) => string | undefined;
	siblingOptionIdFor?: (siblingRequestId: string) => string | undefined;
	suppressSiblingWithheldNote?: boolean;
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
	const stepRows = await chatApprovalStepsRepo.list({
		approvalId: approval.id,
		db: chatDb,
	});
	const withheldSteps = withheldStepsOf({ approval, steps: stepRows });
	const siblingRequestIds = siblingRequestIdsOf({ approval, steps: stepRows });
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
		childSessionIds: childSessionIdsOf(approval),
		expectedToolNames: expectExecution
			? [approval.tool_name, ...withheldSteps.map((write) => write.toolName)]
			: undefined,
		note,
		optionId,
		orgId: approval.org_id,
		requestId: approval.tool_call_id,
		session,
		siblingOptionIdFor,
		siblingRequestIds,
		suppressSiblingWithheldNote,
	});
	const absorbNote =
		chained && !chainedWithheld?.length
			? shouldAbsorbChained?.({
					input: chained.input,
					toolName: chained.toolName,
				})
			: undefined;
	if (chained && absorbNote) {
		// A re-issued duplicate of a write the system just applied — deny it in
		// eve with the reason instead of asking the user again.
		await postEveInputResponse({
			auth,
			note: absorbNote,
			optionId: approvalOptionIds({ options: chained.options }).deny,
			requestId: chained.requestId,
			session,
			siblingRequestIds: chainedSiblingRequestIds,
		});
		logger.info("Absorbed duplicate re-issued write", {
			event: "leaf.approval_duplicate_absorbed",
			approval_id: approval.id,
			data: { tool: chained.toolName },
		});
	}
	const chainedApprovalId =
		chained && !absorbNote
			? await createChainedApproval({
					auth,
					chained,
					providerUserId,
					sessionId: session.sessionId,
					withheld: chainedWithheld,
				})
			: undefined;
	// Eve may execute the approved call before the resumed stream opens, so a
	// turn that did real work without echoing the result still counts as run.
	const settled = !((chained && !absorbNote) || question);
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
