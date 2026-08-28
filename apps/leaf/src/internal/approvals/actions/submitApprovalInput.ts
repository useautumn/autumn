import type { ChatApproval, ChatApprovalWrite } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import {
	ACTION_FAILED_MESSAGE,
	APPROVAL_NOT_EXECUTED_MESSAGE,
} from "../../../ui/messages.js";
import { submitAgentInput } from "../../agentRuntime/actions/submitAgentInput/submitAgentInput.js";
import type { ResumedAgentTurn } from "../../agentRuntime/actions/submitAgentInput/types.js";
import { EveSessionGoneError } from "../../agentRuntime/eve/client.js";
import { getEveSessionBySessionId } from "../../agentRuntime/eve/repo.js";
import { rawErrorShapeText } from "../../autumnMcp/errorResult.js";
import {
	approvalAuthContext,
	childSessionIdsOf,
	siblingDenyOptionFor,
	siblingRequestIdsOf,
	surfaceRendersGroup,
	withheldWritesOf,
} from "../domain/approvalRecord.js";
import { chatApprovalWritesRepo } from "../repos/chatApprovalWritesRepo.js";
import type { SubmittedApprovalResult } from "../types.js";
import { createChainedApproval } from "./createChainedApproval.js";

/** Write rows and resume outcomes share execution order — position 0 is the
 * primary, then the withheld siblings. Steps without evidence stay pending. */
const persistWriteOutcomes = async ({
	writeRows,
	writes,
}: {
	writeRows: ReadonlyArray<ChatApprovalWrite>;
	writes: ResumedAgentTurn["writes"];
}) => {
	await Promise.all(
		writeRows.map((row, index) => {
			const outcome = writes[index];
			if (!outcome || outcome.status === "pending") return undefined;
			return chatApprovalWritesRepo.setStatus({
				db,
				result: outcome.result,
				status: outcome.status,
				writeId: row.id,
			});
		}),
	);
};

/** Answers the park in eve and consumes the resumed turn; the write outcomes
 * eve streams back are persisted onto the approval's write rows. */
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
}): Promise<SubmittedApprovalResult> => {
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
		logger.warn("Eve session not found for approval", {
			event: "leaf.approval_eve_session_not_found",
			approval_id: approval.id,
			data: {
				org_id: approval.org_id,
				run_id: approval.run_id,
				tool: approval.tool_name,
			},
		});
		if (expectExecution) {
			throw new EveSessionGoneError(`Eve session ${approval.run_id} not found`);
		}
		return { result: {}, text: "", writes: [] };
	}
	const startedAt = Date.now();
	const auth = approvalAuthContext({ approval, providerUserId });
	const writeRows = await chatApprovalWritesRepo.list({
		approvalId: approval.id,
		db,
	});
	const withheldSteps = withheldWritesOf({ approval, writes: writeRows });
	const siblingRequestIds = siblingRequestIdsOf({
		approval,
		writes: writeRows,
	});
	const approvalLogData = {
		session_id: session.sessionId,
		tool: approval.tool_name,
	};
	const {
		approvedWriteFailed,
		approvedWriteUnverified,
		chained,
		chainedWithheld,
		deferredEmptyTurn,
		writes,
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
		siblingOptionIdFor: siblingDenyOptionFor(writeRows),
		siblingRequestIds,
	});
	if (expectExecution && writeRows.length) {
		try {
			await persistWriteOutcomes({ writeRows, writes });
		} catch (error) {
			logger.warn("Could not persist approval write outcomes", {
				event: "leaf.approval_write_outcomes_persist_failed",
				approval_id: approval.id,
				error,
			});
		}
	}
	const chainedApprovalId = chained
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
	const settled = !(chained || question);
	const notExecuted =
		expectExecution &&
		(deferredEmptyTurn || (settled && approvedWriteUnverified && !text));
	if (expectExecution && approvedWriteFailed) {
		const failedWrite = writes.find((write) => write.status === "failed");
		logger.error("Approved Eve action failed", undefined, {
			event: "leaf.eve_approval_failed",
			approval_id: approval.id,
			data: {
				...approvalLogData,
				failed_tool: failedWrite?.toolName,
				failure: rawErrorShapeText(failedWrite?.result),
				writes: writes.map((write) => ({
					status: write.status,
					tool: write.toolName,
				})),
			},
		});
		return {
			chainedApprovalId,
			error: true,
			message: text || ACTION_FAILED_MESSAGE,
			retryable: false,
			writes,
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
		writes,
		text,
		toolName: approval.tool_name,
	};
};
