import type { ChatApproval } from "@autumn/shared";
import { chatApprovalRepo } from "../../internal/approvals/repos/chatApprovalRepo.js";
import type { ApprovalRunResult } from "../../internal/approvals/types.js";
import { fetchApprovalPreview } from "../../internal/approvals/utils/fetchApprovalPreview.js";
import { toolRequestFromArgs } from "../../internal/approvals/utils/toolRequest.js";
import { getOrgInstallationToken } from "../../internal/installations/actions/getOrgInstallationToken.js";
import { db } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { APPROVAL_NOT_EXECUTED_MESSAGE } from "../../ui/messages.js";
import { adoptPostedEveSession } from "./adoptPostedSession.js";
import {
	type ChainedPendingRequest,
	classifyParkedEveInput,
	type PendingQuestion,
	siblingRequestIdsFromToolArgs,
} from "./classifyParkedInput.js";
import {
	EveStreamIdleTimeoutError,
	postEveInputResponse,
	resyncEveStreamIndex,
	streamEveEvents,
} from "./client.js";
import { approvalOptionIds, type EveInputRequest } from "./events.js";
import { getEveSessionBySessionId, upsertEveSession } from "./repo.js";
import type { EveAuthContext, EveSessionRef } from "./types.js";

export const approveOptionFromApproval = (approval: ChatApproval) => {
	const args = approval.tool_args as Record<string, unknown>;
	return typeof args._eveApproveOptionId === "string"
		? args._eveApproveOptionId
		: "approve";
};

export const denyOptionFromApproval = (approval: ChatApproval) => {
	const args = approval.tool_args as Record<string, unknown>;
	return typeof args._eveDenyOptionId === "string"
		? args._eveDenyOptionId
		: "deny";
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

const DRAIN_DENY_NOTE =
	"(The user sent a newer message before this was shown, so it was withdrawn. Do not rebuild or ask anything — reply with nothing; act on the user's next message instead.)";
const MAX_DRAIN_DENIES = 3;
/** Drain discards a dead-end turn — give up on silence much sooner than a
 * live run would, an incomplete drain beats blocking the user's message. */
const DRAIN_IDLE_TIMEOUT_MS = 60_000;

/** Consumes (and discards) the turn that resumes after a deny, so its reply
 * never posts and the next user message streams from a clean park. Any gated
 * write the model chains into during the drain is denied too. */
export const drainParkedEveTurn = async ({
	auth,
	orgId,
	session,
}: {
	auth: EveAuthContext;
	orgId: string;
	session: EveSessionRef;
}) => {
	let denies = 0;
	while (true) {
		let parkedAgain = false;
		// Per-iteration: a chained deny reopens the stream, and replayed terminal
		// events must not be accepted before that stream's own turn.started.
		let turnStarted = false;
		try {
			for await (const event of streamEveEvents({
				auth,
				idleTimeoutMs: DRAIN_IDLE_TIMEOUT_MS,
				session,
			})) {
				session.state.streamIndex += 1;
				session.state.lastEventAt = Date.now();
				if (event.type === "turn.started") {
					turnStarted = true;
				} else if (event.type === "input.requested") {
					const parked = classifyParkedEveInput({
						requests: (event.data?.requests ?? []) as EveInputRequest[],
					});
					if (parked?.kind === "gated" && denies < MAX_DRAIN_DENIES) {
						denies += 1;
						const options = approvalOptionIds({
							options: parked.chained.options,
						});
						const posted = await postEveInputResponse({
							auth,
							note: DRAIN_DENY_NOTE,
							optionId: options.deny,
							requestId: parked.chained.requestId,
							session,
							siblingRequestIds: parked.siblingRequestIds,
						});
						adoptPostedEveSession({ posted, session });
						parkedAgain = true;
						break;
					}
					// An ask_question park is fine — the next user message answers it.
					session.state.status = "waiting";
					break;
				} else if (
					turnStarted &&
					(event.type === "session.waiting" ||
						event.type === "session.completed" ||
						event.type === "turn.failed" ||
						event.type === "session.failed")
				) {
					session.state.status =
						event.type === "session.completed" ? "completed" : "waiting";
					break;
				}
			}
		} catch (error) {
			if (!(error instanceof EveStreamIdleTimeoutError)) throw error;
			// The parked turn died silently — heal the cursor and move on so
			// the user's new message isn't blocked behind a dead drain.
			await resyncEveStreamIndex({ auth, session });
			session.state.status = "waiting";
		}
		if (!parkedAgain) break;
	}
	await upsertEveSession({
		db,
		env: session.env,
		orgId,
		sessionId: session.sessionId,
		state: session.state,
		threadKey: session.threadKey,
	});
};

/** Withdraws a parked gated write silently (no card was ever shown) and
 * drains the resumed turn — used when a newer user message is already queued,
 * so the thread gets exactly one response. */
export const withdrawEveSuspension = async ({
	auth,
	orgId,
	runId,
	suspension,
}: {
	auth: EveAuthContext;
	orgId: string;
	runId: string;
	suspension: { toolArgs: Record<string, unknown>; toolCallId?: string };
}) => {
	if (!suspension.toolCallId) return false;
	const session = await getEveSessionBySessionId({
		db,
		orgId,
		sessionId: runId,
	});
	if (!session) return false;
	const denyOptionId =
		typeof suspension.toolArgs._eveDenyOptionId === "string"
			? suspension.toolArgs._eveDenyOptionId
			: "deny";
	const posted = await postEveInputResponse({
		auth,
		note: DRAIN_DENY_NOTE,
		optionId: denyOptionId,
		requestId: suspension.toolCallId,
		session,
		siblingRequestIds: siblingRequestIdsFromToolArgs(suspension.toolArgs),
	});
	adoptPostedEveSession({ posted, session, status: "running" });
	await drainParkedEveTurn({ auth, orgId, session });
	return true;
};

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
				requests: (event.data?.requests ?? []) as EveInputRequest[],
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
			const messageSoFar = event.data?.messageSoFar;
			pendingText =
				typeof messageSoFar === "string"
					? messageSoFar
					: `${pendingText}${String(event.data?.messageDelta ?? "")}`;
		} else if (event.type === "message.completed" && turnStarted) {
			sawTurnActivity = true;
			if (event.data?.finishReason !== "tool-calls") {
				text = String(event.data?.message ?? pendingText);
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
			throw new Error(String(event.data?.message ?? "Eve failed"));
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
