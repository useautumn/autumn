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

const withdrawInEve = async ({
	approval,
	auth,
	orgId,
	requestId,
	session,
}: {
	approval: ChatApproval;
	auth: EveAuthContext;
	orgId: string;
	requestId: string;
	session: EveSessionRef;
}) => {
	const posted = await postEveInputResponse({
		auth,
		note: WITHDRAWN_NOTE,
		optionId: denyOptionFromApproval(approval),
		requestId,
		session,
	});
	adoptPostedEveSession({ posted, session, status: "running" });
	// Discard the withdrawal turn's reply — without this, its text would end
	// THIS run and the user's actual message would be processed with nobody
	// streaming.
	await drainParkedEveTurn({ auth, orgId, session });
};

const STILL_PARKED_MESSAGE =
	"there's still an open approval card on this thread — approve or discard it before sending a new message";

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
	let stillParked = false;
	for (const approval of pendingApprovals) {
		if (approval.tool_call_id) {
			try {
				await withdrawInEve({
					approval,
					auth,
					orgId,
					requestId: approval.tool_call_id,
					session,
				});
			} catch (error) {
				logger.warn("Could not deny superseded Eve approval", {
					event: "leaf.eve_superseded_approval_deny_failed",
					approval_id: approval.id,
					data: {
						error: error instanceof Error ? error.message : String(error),
					},
				});
				// Leave the row pending: the card stays decidable, and the next
				// message retries the withdrawal.
				stillParked = true;
				continue;
			}
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
	if (stillParked) {
		// A partial withdrawal may already have re-homed eve onto a new session
		// id — persist it or the next message resumes a run that no longer exists.
		await saveEveSessionState({ orgId, session });
		throw new Error(STILL_PARKED_MESSAGE);
	}
};
