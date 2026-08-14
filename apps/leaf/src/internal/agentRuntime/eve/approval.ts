import type { ChatApproval } from "@autumn/shared";
import { chatApprovalRepo } from "../../approvals/repos/chatApprovalRepo.js";
import type { ApprovalRunResult } from "../../approvals/types.js";
import { fetchApprovalPreview } from "../../approvals/utils/fetchApprovalPreview.js";
import { toolRequestFromArgs } from "../../approvals/utils/toolRequest.js";
import { getOrgInstallationToken } from "../../installations/actions/getOrgInstallationToken.js";
import { db } from "../../../lib/db.js";
import { logger } from "../../../lib/logger.js";
import { APPROVAL_NOT_EXECUTED_MESSAGE } from "../../../ui/messages.js";
import { adoptPostedEveSession } from "./adoptPostedSession.js";
import {
	type ChainedPendingRequest,
	classifyParkedEveInput,
	type PendingQuestion,
	siblingRequestIdsFromToolArgs,
} from "./classifyParkedInput.js";
import { postEveInputResponse, streamEveEvents } from "./client.js";
import { approvalOptionIds } from "./events.js";
import { denyOptionFromApproval, drainParkedEveTurn } from "./parkedTurn.js";
import { getEveSessionBySessionId, upsertEveSession } from "./repo.js";
import type { EveAuthContext, EveSessionRef } from "./types.js";

export const approveOptionFromApproval = (approval: ChatApproval) => {
	const args = approval.tool_args as Record<string, unknown>;
	return typeof args._eveApproveOptionId === "string"
		? args._eveApproveOptionId
		: "approve";
};

const authFromApproval = (
	approval: ChatApproval,
	providerUserId: string,
): EveAuthContext => ({
	appEnv: approval.env,
	channelId: approval.channel_id,
	orgId: approval.org_id,
	provider: approval.provider,
	providerUserId,
	threadId: approval.channel_id,
	workspaceId: approval.workspace_id,
});

const collectText = async ({
	auth,
	orgId,
	session,
	skipRequestId,
}: {
	auth: EveAuthContext;
	orgId: string;
	session: EveSessionRef;
	skipRequestId?: string;
}) => {
	let text = "";
	let pendingText = "";
	let chained: ChainedPendingRequest | undefined;
	let chainedSiblingRequestIds: string[] = [];
	let question: PendingQuestion | undefined;
	let sawEvent = false;
	// Anything beyond the turn's own lifecycle events: a step, a tool, a token
	// of message, a park. Eve's deferred-delivery turns have none of it.
	let sawTurnActivity = false;
	// Stale tail events from the parked turn replay first (see engine.ts) —
	// only honor terminal events once the resumed turn's turn.started arrives.
	let turnStarted = false;
	for await (const event of streamEveEvents({ auth, session })) {
		sawEvent = true;
		session.state.streamIndex += 1;
		session.state.lastEventAt = Date.now();
		if (
			event.type === "step.started" ||
			event.type === "actions.requested" ||
			event.type === "action.result" ||
			event.type === "input.requested"
		) {
			sawTurnActivity = true;
		}
		if (event.type === "turn.started") {
			turnStarted = true;
		} else if (event.type === "input.requested") {
			// The resumed turn parks where nobody streams — every shape has to be
			// captured here or the request is orphaned and the thread wedges.
			const parkedInput = classifyParkedEveInput({
				requests: event.requests,
				skipRequestId,
			});
			if (parkedInput?.kind === "gated") {
				chained = parkedInput.chained;
				chainedSiblingRequestIds = parkedInput.siblingRequestIds;
				break;
			}
			if (parkedInput?.kind === "question") {
				question = parkedInput.question;
				session.state.status = "waiting";
				break;
			}
			if (parkedInput) {
				// Only when the turn said nothing — the model's own reply beats a
				// generic "waiting for input" line.
				if (!(text || pendingText)) text = parkedInput.text;
				session.state.status = "waiting";
				break;
			}
		} else if (event.type === "message.appended" && turnStarted) {
			sawTurnActivity = true;
			const messageSoFar = event.messageSoFar;
			pendingText =
				typeof messageSoFar === "string"
					? messageSoFar
					: `${pendingText}${event.messageDelta}`;
		} else if (event.type === "message.completed" && turnStarted) {
			sawTurnActivity = true;
			if (event.finishReason !== "tool-calls") {
				text = event.message || pendingText;
			}
			pendingText = "";
		} else if (
			turnStarted &&
			(event.type === "session.waiting" || event.type === "session.completed")
		) {
			session.state.status =
				event.type === "session.completed" ? "completed" : "waiting";
			break;
		} else if (
			turnStarted &&
			(event.type === "turn.failed" || event.type === "session.failed")
		) {
			session.state.status = "failed";
			throw new Error(event.message);
		}
	}
	// Nothing was read, so nothing advanced — never persist a cursor the turn
	// did not actually reach.
	if (sawEvent) {
		await upsertEveSession({
			db,
			env: session.env,
			orgId,
			sessionId: session.sessionId,
			state: session.state,
			threadKey: session.threadKey,
		});
	}
	return {
		chained,
		chainedSiblingRequestIds,
		// Eve's tell for a delivery it deferred: the turn opened and closed
		// without running, saying, or asking anything.
		deferredEmptyTurn: turnStarted && !(sawTurnActivity || text || pendingText),
		question,
		text: text || pendingText,
	};
};

/** Answers a parked request and consumes the turn it resumes, surfacing any
 * gated write that turn chained into as a fresh card. */
const answerParkedRequest = async ({
	auth,
	note,
	optionId,
	orgId,
	providerUserId,
	requestId,
	session,
	siblingRequestIds,
}: {
	auth: EveAuthContext;
	note?: string;
	optionId: string;
	orgId: string;
	providerUserId: string;
	requestId: string;
	session: EveSessionRef;
	siblingRequestIds?: string[];
}) => {
	const posted = await postEveInputResponse({
		auth,
		note,
		optionId,
		requestId,
		session,
		siblingRequestIds,
	});
	adoptPostedEveSession({ posted, session, status: "running" });
	await upsertEveSession({
		db,
		env: session.env,
		orgId,
		sessionId: session.sessionId,
		state: session.state,
		threadKey: session.threadKey,
	});
	const {
		chained,
		chainedSiblingRequestIds,
		deferredEmptyTurn,
		question,
		text,
	} = await collectText({
		auth,
		orgId,
		session,
		skipRequestId: requestId,
	});
	const chainedApprovalId = chained
		? await insertChainedApproval({
				auth,
				chained,
				providerUserId,
				sessionId: session.sessionId,
				siblingRequestIds: chainedSiblingRequestIds,
			})
		: undefined;
	return { chainedApprovalId, deferredEmptyTurn, question, text };
};

const answerEveApproval = async ({
	approval,
	expectExecution,
	note,
	optionId,
	providerUserId,
}: {
	approval: ChatApproval;
	/** Set when the answer was an approval: the resumed turn is then expected to
	 * actually run the write, and a turn that does nothing is a failure. */
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
	const { chainedApprovalId, deferredEmptyTurn, question, text } =
		await answerParkedRequest({
			auth: authFromApproval(approval, providerUserId),
			note,
			optionId,
			orgId: approval.org_id,
			providerUserId,
			requestId: approval.tool_call_id,
			session,
			siblingRequestIds: siblingRequestIdsFromToolArgs(approval.tool_args),
		});
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

/** Surfaces a chained gated write as a fresh approval row; the dashboard's
 * interactions poll (or the Slack handler) renders it as a new card. The
 * preview must be backfilled here too — this path never goes through
 * presentWebApproval, and a card without a preview renders bare. */
const insertChainedApproval = async ({
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
	siblingRequestIds: string[];
}) => {
	const env = auth.appEnv as ChatApproval["env"];
	const provider = auth.provider as ChatApproval["provider"];
	const options = approvalOptionIds({ options: chained.options });
	let preview: unknown;
	try {
		// Credentials are keyed by Autumn user id: web principals carry it as
		// providerUserId; Slack falls back to the installer credential when unset.
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
	return await chatApprovalRepo.insert({
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

/** Answers a parked ask_question via structured inputResponses and drains the
 * resumed turn — the button-click analog of a typed reply. */
export const answerEveQuestion = async ({
	auth,
	optionId,
	orgId,
	requestId,
	sessionId,
}: {
	auth: EveAuthContext;
	optionId: string;
	orgId: string;
	requestId: string;
	sessionId: string;
}): Promise<
	| { error: true; message: string }
	| {
			chainedApprovalId?: string;
			question?: PendingQuestion;
			sessionId: string;
			text: string;
	  }
> => {
	const session = await getEveSessionBySessionId({ db, orgId, sessionId });
	if (!session) return { error: true, message: "Eve session not found." };
	const { chainedApprovalId, question, text } = await answerParkedRequest({
		auth,
		optionId,
		orgId,
		providerUserId: auth.providerUserId,
		requestId,
		session,
	});
	return { chainedApprovalId, question, sessionId: session.sessionId, text };
};

export const resumeEveApproval = async ({
	approval,
	providerUserId,
}: {
	approval: ChatApproval;
	onProgress?: (statusLine: string) => void;
	providerUserId: string;
}): Promise<ApprovalRunResult> =>
	answerEveApproval({
		approval,
		expectExecution: true,
		optionId: approveOptionFromApproval(approval),
		providerUserId,
	});

/** Deny the parked tool call in Eve, not just locally. Without this the
 * session stays waiting on the stale approval: Eve holds the user's next
 * message behind it, and the discarded write can still execute later. */
export const denyEveApproval = async ({
	approval,
	providerUserId,
}: {
	approval: ChatApproval;
	providerUserId: string;
}): Promise<ApprovalRunResult> =>
	answerEveApproval({
		approval,
		note: "(Dashboard: the user clicked Discard on this change. Acknowledge briefly and ask what they'd like different — they are NOT waiting on any further approval.)",
		optionId: denyOptionFromApproval(approval),
		providerUserId,
	});
