import type { AutumnLogger } from "@autumn/logging";
import type { ChatApproval } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { APPROVAL_STILL_OPEN_MESSAGE } from "../../../ui/messages.js";
import type { AgentThreadRef } from "../../agentRuntime/domain/agentTurnContext.js";
import type { EveSessionRef } from "../../agentRuntime/eve/types.js";
import { normalizeToolName } from "../../agentRuntime/tools/toolPolicy.js";
import { approvalDenyPlan } from "../domain/approvalRecord.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import { chatApprovalWritesRepo } from "../repos/chatApprovalWritesRepo.js";

export const withdrawnNoteFor = (toolName: string) =>
	`(The user replied with a new message instead of deciding on this pending request, so it was withdrawn and nothing is pending any more. Act on the user's message, treating it as a refinement of the withdrawn change where it reads like one. If it is a QUESTION about the withdrawn change, answer it and then re-issue that same write unchanged so the card is back for them to confirm — never describe a withdrawn change as awaiting their confirmation when no card is open.${
		normalizeToolName(toolName) === "attach"
			? " Keep an attach refinement customer-specific; use catalog tools only if they explicitly ask to change the shared plan."
			: ""
	})`;

const MANY_WITHDRAWN_NOTE =
	"(The user replied with a new message instead of deciding on the pending requests, so they were all withdrawn and nothing is pending any more. Act on the user's message. If it is a QUESTION about the withdrawn changes, answer it and then re-issue those same writes unchanged so the cards are back for them to confirm.)";

export type ApprovalWithdrawal = {
	inputResponses: Array<{ optionId: string; requestId: string }>;
	note: string;
};

const denyResponsesFor = async (
	approval: ChatApproval,
): Promise<ApprovalWithdrawal["inputResponses"]> => {
	const toolCallId = approval.tool_call_id;
	if (!toolCallId) return [];
	const writes = await chatApprovalWritesRepo.list({
		approvalId: approval.id,
		db,
	});
	const plan = approvalDenyPlan({
		approval: { ...approval, tool_call_id: toolCallId },
		writes,
	});
	return [
		{ optionId: plan.optionId, requestId: plan.requestId },
		...plan.siblingRequestIds
			.filter((siblingRequestId) => siblingRequestId !== plan.requestId)
			.map((siblingRequestId) => ({
				optionId: plan.siblingOptionIdFor(siblingRequestId) ?? "deny",
				requestId: siblingRequestId,
			})),
	];
};

/** Cancels the pending cards and returns their deny responses to ride the
 * SAME eve post as the user's new message — no wind-down turn of its own. */
export const withdrawSupersededApprovals = async ({
	logger,
	onApprovalsSuperseded,
	orgId,
	providerUserId,
	session,
	thread,
}: {
	logger: AutumnLogger;
	onApprovalsSuperseded?: (approvals: ChatApproval[]) => Promise<void> | void;
	orgId: string;
	providerUserId: string;
	session: EveSessionRef;
	thread: AgentThreadRef;
}): Promise<{ withdrawal?: ApprovalWithdrawal }> => {
	const pendingApprovals = await chatApprovalRepo.listPendingForRun({
		db,
		channelId: thread.channelId,
		env: session.env,
		orgId,
		provider: thread.provider,
		runId: session.sessionId,
		workspaceId: thread.workspaceId,
	});
	if (pendingApprovals.length === 0) return {};

	const foreignApprovals = pendingApprovals.filter(
		(approval) => approval.run_id && approval.run_id !== session.sessionId,
	);
	const ownApprovals = pendingApprovals.filter(
		(approval) => !foreignApprovals.includes(approval),
	);

	const inputResponses: ApprovalWithdrawal["inputResponses"] = [];
	const cancelledApprovals: ChatApproval[] = [];
	for (const approval of ownApprovals) {
		inputResponses.push(...(await denyResponsesFor(approval)));
		const cancelled = await chatApprovalRepo.cancel({
			approvalId: approval.id,
			db,
			providerUserId,
		});
		cancelledApprovals.push(cancelled ?? approval);
	}

	if (cancelledApprovals.length > 0) {
		await onApprovalsSuperseded?.(cancelledApprovals);
	}

	if (foreignApprovals.length > 0) {
		logger.warn("Pending approvals live in another run; rehoming them", {
			event: "leaf.eve_superseded_approvals_rehomed",
			data: {
				approval_ids: foreignApprovals.map((approval) => approval.id),
				session_id: session.sessionId,
			},
		});
		for (const approval of foreignApprovals) {
			await chatApprovalRepo.moveToRun({
				approvalId: approval.id,
				db,
				fromRunId: approval.run_id as string,
				toRunId: session.sessionId,
			});
		}
		throw new Error(APPROVAL_STILL_OPEN_MESSAGE);
	}

	if (inputResponses.length === 0) return {};
	logger.info("Withdrew pending approvals for the user's new message", {
		event: "leaf.eve_approvals_superseded",
		data: {
			approval_ids: cancelledApprovals.map((approval) => approval.id),
			request_ids: inputResponses.map((response) => response.requestId),
			session_id: session.sessionId,
		},
	});
	const note =
		cancelledApprovals.length === 1 && cancelledApprovals[0]
			? withdrawnNoteFor(cancelledApprovals[0].tool_name)
			: MANY_WITHDRAWN_NOTE;
	return { withdrawal: { inputResponses, note } };
};
