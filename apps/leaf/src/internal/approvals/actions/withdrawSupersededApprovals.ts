import type { AutumnLogger } from "@autumn/logging";
import type { ChatApproval } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { APPROVAL_STILL_OPEN_MESSAGE } from "../../../ui/messages.js";
import type { AgentThreadRef } from "../../agentRuntime/domain/agentTurnContext.js";
import type {
	EveAuthContext,
	EveSessionRef,
} from "../../agentRuntime/eve/types.js";
import { normalizeToolName } from "../../agentRuntime/tools/toolPolicy.js";
import {
	denyOptionOf,
	siblingDenyOptionFor,
	siblingRequestIdsOf,
} from "../domain/approvalRecord.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import { chatApprovalWritesRepo } from "../repos/chatApprovalWritesRepo.js";

const withdrawnNote = (toolName: string) =>
	`(The user replied with a new message instead of deciding on this pending request, so it was withdrawn. Do not rebuild, retry, or ask anything about the withdrawn change — the user's message follows immediately and you should act on that, treating it as a refinement of the withdrawn change where it reads like one. If it is a QUESTION about the withdrawn change, answer it briefly and then re-issue that same write unchanged so the user gets the card back to decide on.${
		normalizeToolName(toolName) === "attach"
			? " Keep an attach refinement customer-specific; use catalog tools only if they explicitly ask to change the shared plan."
			: ""
	})`;

const MANY_WITHDRAWN_NOTE =
	"(The user replied with a new message instead of deciding on the pending requests, so they were all withdrawn. Do not rebuild, retry, or ask anything about the withdrawn changes — the user's message follows immediately and you should act on that.)";

export type ApprovalWithdrawal = {
	inputResponses: Array<{ optionId: string; requestId: string }>;
	note: string;
};

const denyResponsesFor = async (
	approval: ChatApproval,
): Promise<ApprovalWithdrawal["inputResponses"]> => {
	if (!approval.tool_call_id) return [];
	const writes = await chatApprovalWritesRepo.list({
		approvalId: approval.id,
		db,
	});
	const siblingDenyOption = siblingDenyOptionFor(writes);
	return [
		{ optionId: denyOptionOf(approval), requestId: approval.tool_call_id },
		...siblingRequestIdsOf({ approval, writes })
			.filter((siblingRequestId) => siblingRequestId !== approval.tool_call_id)
			.map((siblingRequestId) => ({
				optionId: siblingDenyOption(siblingRequestId) ?? "deny",
				requestId: siblingRequestId,
			})),
	];
};

/** Supersede without a drain: pending cards are cancelled here, and their deny
 * responses are returned to ride the SAME eve post as the user's new message —
 * the withdrawn turn never gets a model turn of its own to wind down. */
export const withdrawSupersededApprovals = async ({
	logger,
	onApprovalsSuperseded,
	orgId,
	providerUserId,
	session,
	thread,
}: {
	auth?: EveAuthContext;
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

	// A park living in another run cannot be answered through this session's
	// continuation; bundling its request id would invalidate the whole post.
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
	const note =
		cancelledApprovals.length === 1 && cancelledApprovals[0]
			? withdrawnNote(cancelledApprovals[0].tool_name)
			: MANY_WITHDRAWN_NOTE;
	return { withdrawal: { inputResponses, note } };
};
