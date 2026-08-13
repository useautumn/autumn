import type { AutumnLogger } from "@autumn/logging";
import type { ChatApproval } from "@autumn/shared";
import type { ThreadRef } from "../../agent/runMessage/types.js";
import { chatApprovalRepo } from "../../internal/approvals/repos/chatApprovalRepo.js";
import { db } from "../../lib/db.js";
import { adoptPostedEveSession } from "./adoptPostedSession.js";
import { denyOptionFromApproval, drainParkedEveTurn } from "./approval.js";
import { postEveInputResponse } from "./client.js";
import { saveEveSessionState } from "./sessionState.js";
import type { EveAuthContext, EveSessionRef } from "./types.js";

const WITHDRAWN_NOTE =
	"(The user replied with a new message instead of deciding on this pending request, so it was withdrawn. Do not rebuild or ask anything — reply with nothing; their new message follows immediately and you should act on that, treating it as a refinement of the withdrawn change where it reads like one.)";

const STILL_PARKED_MESSAGE =
	"there's still an open approval card on this thread — approve or discard it before sending a new message";

/** Whether eve let go of this card. A refusal leaves the row pending, so the
 * card stays decidable and the next message retries the withdrawal. */
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
	// A card eve never registered has nothing to withdraw.
	if (!approval.tool_call_id) return true;
	try {
		const posted = await postEveInputResponse({
			auth,
			note: WITHDRAWN_NOTE,
			optionId: denyOptionFromApproval(approval),
			requestId: approval.tool_call_id,
			session,
		});
		adoptPostedEveSession({ posted, session, status: "running" });
		// Discard the withdrawal turn's reply — without this, its text would end
		// THIS run and the user's actual message would be processed with nobody
		// streaming.
		await drainParkedEveTurn({ auth, orgId, session });
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

/** Moves cards left pending onto the session id eve re-homed the run to, so
 * they stay findable once the new id is persisted over the old one. */
const rehomeUndecidedApprovals = async ({
	approvals,
	sessionId,
}: {
	approvals: ChatApproval[];
	sessionId: string;
}) => {
	for (const approval of approvals) {
		// Listed by run_id, so a row without one already moved on.
		if (!approval.run_id || approval.run_id === sessionId) continue;
		await chatApprovalRepo.moveToRun({
			approvalId: approval.id,
			db,
			fromRunId: approval.run_id,
			toRunId: sessionId,
		});
	}
};

/** Cancels the approval cards the user answered with a new message rather than
 * a decision, in eve as well as locally, so this turn streams from a clean
 * park instead of queueing behind a request nobody will decide. */
export const withdrawSupersededEveApprovals = async ({
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
	thread: ThreadRef;
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

	// A partial withdrawal may already have re-homed eve onto a new session id —
	// persist it, but move the surviving cards first or they orphan on the old one.
	await rehomeUndecidedApprovals({
		approvals: undecidedApprovals,
		sessionId: session.sessionId,
	});
	await saveEveSessionState({ orgId, session });
	throw new Error(STILL_PARKED_MESSAGE);
};
