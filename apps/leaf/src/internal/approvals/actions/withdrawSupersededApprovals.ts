import type { AutumnLogger } from "@autumn/logging";
import type { ChatApproval } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { APPROVAL_STILL_OPEN_MESSAGE } from "../../../ui/messages.js";
import { drainParkedAgentTurn } from "../../agentRuntime/actions/submitAgentInput/drainParkedAgentTurn.js";
import type { AgentThreadRef } from "../../agentRuntime/domain/agentTurnContext.js";
import { adoptPostedEveSession } from "../../agentRuntime/eve/adoptPostedSession.js";
import { postEveInputResponse } from "../../agentRuntime/eve/client.js";
import { siblingRequestIdsFromToolArgs } from "../../agentRuntime/eve/parkedInput.js";
import { saveEveSessionState } from "../../agentRuntime/eve/sessionState.js";
import type {
	EveAuthContext,
	EveSessionRef,
} from "../../agentRuntime/eve/types.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import { denyOptionFromApproval } from "./approvalOptions.js";

const WITHDRAWN_NOTE =
	"(The user replied with a new message instead of deciding on this pending request, so it was withdrawn. Do not rebuild or ask anything — reply with nothing; their new message follows immediately and you should act on that, treating it as a refinement of the withdrawn change where it reads like one.)";

const withdrewInEve = async ({
	approval,
	auth,
	logger,
	orgId,
	session,
}: {
	approval: ChatApproval;
	auth: EveAuthContext;
	logger: AutumnLogger;
	orgId: string;
	session: EveSessionRef;
}) => {
	if (!approval.tool_call_id) return true;
	try {
		const posted = await postEveInputResponse({
			auth,
			note: WITHDRAWN_NOTE,
			optionId: denyOptionFromApproval(approval),
			requestId: approval.tool_call_id,
			session,
			siblingRequestIds: siblingRequestIdsFromToolArgs(approval.tool_args),
		});
		adoptPostedEveSession({ posted, session, status: "running" });
		await drainParkedAgentTurn({ auth, orgId, session });
		return true;
	} catch (error) {
		logger.warn("Could not deny superseded Eve approval", {
			event: "leaf.eve_superseded_approval_deny_failed",
			approval_id: approval.id,
			data: { error: error instanceof Error ? error.message : String(error) },
		});
		return false;
	}
};

const rehomeUndecidedApprovals = async ({
	approvals,
	sessionId,
}: {
	approvals: ChatApproval[];
	sessionId: string;
}) => {
	for (const approval of approvals) {
		if (!approval.run_id || approval.run_id === sessionId) continue;
		await chatApprovalRepo.moveToRun({
			approvalId: approval.id,
			db,
			fromRunId: approval.run_id,
			toRunId: sessionId,
		});
	}
};

export const withdrawSupersededApprovals = async ({
	auth,
	logger,
	onApprovalsSuperseded,
	orgId,
	providerUserId,
	session,
	thread,
}: {
	auth: EveAuthContext;
	logger: AutumnLogger;
	onApprovalsSuperseded?: (approvals: ChatApproval[]) => Promise<void> | void;
	orgId: string;
	providerUserId: string;
	session: EveSessionRef;
	thread: AgentThreadRef;
}) => {
	const pendingApprovals = await chatApprovalRepo.listPendingForRun({
		db,
		channelId: thread.channelId,
		env: session.env,
		orgId,
		provider: thread.provider,
		runId: session.sessionId,
		workspaceId: thread.workspaceId,
	});
	if (pendingApprovals.length === 0) return;

	const cancelledApprovals: ChatApproval[] = [];
	const undecidedApprovals: ChatApproval[] = [];
	for (const approval of pendingApprovals) {
		if (!(await withdrewInEve({ approval, auth, logger, orgId, session }))) {
			undecidedApprovals.push(approval);
			continue;
		}
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
	if (undecidedApprovals.length === 0) return;

	await rehomeUndecidedApprovals({
		approvals: undecidedApprovals,
		sessionId: session.sessionId,
	});
	await saveEveSessionState({ orgId, session });
	throw new Error(APPROVAL_STILL_OPEN_MESSAGE);
};
