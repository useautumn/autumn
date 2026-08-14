import type { ChatApproval } from "@autumn/shared";
import { chatApprovalRepo } from "../../internal/approvals/repos/chatApprovalRepo.js";
import type { ApprovalGroupRunResult } from "../../internal/approvals/types.js";
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
	postEveInputResponses,
	resyncEveStreamIndex,
	streamEveEvents,
} from "./client.js";
import {
	approvalOptionIds,
	type EveInputRequest,
	storedOptionIds,
} from "./events.js";
import { getEveSessionBySessionId, upsertEveSession } from "./repo.js";
import type { EveAuthContext, EveSessionRef } from "./types.js";

export const approveOptionFromApproval = (approval: ChatApproval) =>
	storedOptionIds(approval.tool_args as Record<string, unknown>).approve;

export const denyOptionFromApproval = (approval: ChatApproval) =>
	storedOptionIds(approval.tool_args as Record<string, unknown>).deny;

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

const parkedInputFrom = ({
	event,
	skipRequestIds,
}: {
	event: { data?: Record<string, unknown> };
	skipRequestIds?: Set<string>;
}) =>
	classifyParkedEveInput({
		requests: (event.data?.requests ?? []) as EveInputRequest[],
		skipRequestIds,
	});

const denyResponsesFor = (gated: ChainedPendingRequest[]) =>
	gated.map((request) => ({
		optionId: approvalOptionIds({ options: request.options }).deny,
		requestId: request.requestId,
	}));

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
					const parked = parkedInputFrom({ event });
					if (parked?.kind === "gated" && denies < MAX_DRAIN_DENIES) {
						denies += 1;
						const posted = await postEveInputResponses({
							auth,
							note: DRAIN_DENY_NOTE,
							responses: denyResponsesFor(parked.gated),
							session,
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

/** Withdraws parked gated writes silently (no card was ever shown) and drains
 * the resumed turn — used when a newer user message is already queued, so the
 * thread gets exactly one response. */
export const withdrawEveSuspensions = async ({
	auth,
	orgId,
	runId,
	suspensions,
}: {
	auth: EveAuthContext;
	orgId: string;
	runId: string;
	suspensions: { toolArgs: Record<string, unknown>; toolCallId?: string }[];
}) => {
	const parked = suspensions.filter((suspension) => suspension.toolCallId);
	if (parked.length === 0) return false;
	const session = await getEveSessionBySessionId({
		db,
		orgId,
		sessionId: runId,
	});
	if (!session) return false;
	const posted = await postEveInputResponses({
		auth,
		note: DRAIN_DENY_NOTE,
		responses: parked.map((suspension) => ({
			optionId: storedOptionIds(suspension.toolArgs).deny,
			requestId: suspension.toolCallId as string,
		})),
		session,
		siblingRequestIds: parked.flatMap((suspension) =>
			siblingRequestIdsFromToolArgs(suspension.toolArgs),
		),
	});
	adoptPostedEveSession({ posted, session, status: "running" });
	await drainParkedEveTurn({ auth, orgId, session });
	return true;
};

const collectText = async ({
	auth,
	orgId,
	session,
	skipRequestIds,
}: {
	auth: EveAuthContext;
	orgId: string;
	session: EveSessionRef;
	skipRequestIds?: Set<string>;
}) => {
	let text = "";
	let pendingText = "";
	let chained: ChainedPendingRequest[] = [];
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
			const parkedInput = parkedInputFrom({ event, skipRequestIds });
			if (parkedInput?.kind === "gated") {
				chained = parkedInput.gated;
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
		// Eve's tell for a delivery it deferred: the turn opened and closed
		// without running, saying, or asking anything.
		deferredEmptyTurn: turnStarted && !(sawTurnActivity || text || pendingText),
		question,
		text: text || pendingText,
	};
};

/** Answers every parked request in one POST and consumes the turn it resumes,
 * surfacing any gated writes that turn chained into as a fresh group. Answering
 * them one at a time would resume the turn while its siblings are still parked. */
const answerParkedRequests = async ({
	auth,
	note,
	orgId,
	providerUserId,
	responses,
	session,
	siblingRequestIds,
}: {
	auth: EveAuthContext;
	note?: string;
	orgId: string;
	providerUserId: string;
	responses: { optionId: string; requestId: string }[];
	session: EveSessionRef;
	siblingRequestIds?: string[];
}) => {
	const posted = await postEveInputResponses({
		auth,
		note,
		responses,
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
	const { chained, deferredEmptyTurn, question, text } = await collectText({
		auth,
		orgId,
		session,
		skipRequestIds: new Set(responses.map(({ requestId }) => requestId)),
	});
	const chainedGroupId = chained.length
		? await insertChainedApprovalGroup({
				auth,
				chained,
				providerUserId,
				sessionId: session.sessionId,
			})
		: undefined;
	return { chainedGroupId, deferredEmptyTurn, question, text };
};

/** Answers every approval in the group in one POST — answering them one at a
 * time would resume the turn while its siblings are still parked. */
const answerEveApprovals = async ({
	approvals,
	expectExecution,
	note,
	optionIdFor,
	providerUserId,
}: {
	approvals: ChatApproval[];
	/** Set when the answer was an approval: the resumed turn is then expected to
	 * actually run the writes, and a turn that does nothing is a failure. */
	expectExecution?: boolean;
	note?: string;
	optionIdFor: (approval: ChatApproval) => string;
	providerUserId: string;
}): Promise<ApprovalGroupRunResult> => {
	const [first] = approvals;
	if (!first) {
		return {
			error: true,
			message: "No approvals to resolve.",
			retryable: false,
		};
	}
	if (!first.run_id || approvals.some((approval) => !approval.tool_call_id)) {
		return {
			error: true,
			message: "Eve approval is missing session state.",
			retryable: false,
		};
	}
	const session = await getEveSessionBySessionId({
		db,
		orgId: first.org_id,
		sessionId: first.run_id,
	});
	if (!session) {
		return {
			error: true,
			message: "Eve session not found.",
			retryable: true,
		};
	}
	const { chainedGroupId, deferredEmptyTurn, question, text } =
		await answerParkedRequests({
			auth: authFromApproval(first, providerUserId),
			note,
			orgId: first.org_id,
			providerUserId,
			responses: approvals.map((approval) => ({
				optionId: optionIdFor(approval),
				requestId: approval.tool_call_id as string,
			})),
			session,
			siblingRequestIds: approvals.flatMap((approval) =>
				siblingRequestIdsFromToolArgs(approval.tool_args),
			),
		});
	if (expectExecution && deferredEmptyTurn) {
		logger.error("Approved Eve action was not executed", undefined, {
			event: "leaf.eve_approval_not_executed",
			approval_id: first.id,
			data: {
				session_id: session.sessionId,
				tools: approvals.map((approval) => approval.tool_name),
			},
		});
		return {
			error: true,
			message: APPROVAL_NOT_EXECUTED_MESSAGE,
			retryable: true,
		};
	}
	return {
		chainedGroupId,
		question: question
			? { ...question, sessionId: session.sessionId }
			: undefined,
		text,
	};
};

/** Surfaces chained gated writes as a fresh approval group; the dashboard's
 * interactions poll (or the Slack handler) renders it as a new card. Previews
 * must be backfilled here too — this path never goes through presentApproval,
 * and a card without a preview renders bare. */
const insertChainedApprovalGroup = async ({
	auth,
	chained,
	providerUserId,
	sessionId,
}: {
	auth: EveAuthContext;
	chained: ChainedPendingRequest[];
	providerUserId: string;
	sessionId: string;
}) => {
	const env = auth.appEnv as ChatApproval["env"];
	const provider = auth.provider as ChatApproval["provider"];
	let accessToken: string | undefined;
	try {
		// Credentials are keyed by Autumn user id: web principals carry it as
		// providerUserId; Slack falls back to the installer credential when unset.
		const credentialUserId =
			provider === "web" ? providerUserId : auth.autumnUserId;
		({ accessToken } = await getOrgInstallationToken({
			env,
			orgId: auth.orgId,
			provider,
			userId: credentialUserId,
			workspaceId: auth.workspaceId,
		}));
	} catch (error) {
		logger.warn("Could not load token for chained approval previews", {
			event: "leaf.eve_chained_preview_backfill_failed",
			data: {
				error: error instanceof Error ? error.message : String(error),
			},
		});
	}

	const previews = await Promise.all(
		chained.map(async (request) => {
			if (!accessToken) return undefined;
			return await fetchApprovalPreview({
				env,
				logger,
				request: toolRequestFromArgs(request.input ?? {}),
				token: accessToken,
				toolName: request.toolName,
			});
		}),
	);

	const { groupId } = await chatApprovalRepo.insertGroup({
		db,
		items: chained.map((request, index) => {
			const options = approvalOptionIds({ options: request.options });
			return {
				preview: previews[index],
				toolArgs: {
					...(request.input ?? {}),
					_eveApproveOptionId: options.approve,
					_eveDenyOptionId: options.deny,
					_eveSiblingRequestIds: chained
						.filter((sibling) => sibling.requestId !== request.requestId)
						.map((sibling) => sibling.requestId),
				},
				toolCallId: request.requestId,
				toolName: request.toolName,
			};
		}),
		shared: {
			channelId: auth.channelId,
			env,
			harness: "eve",
			orgId: auth.orgId,
			provider,
			providerUserId,
			runId: sessionId,
			workspaceId: auth.workspaceId,
		},
	});
	return groupId;
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
			chainedGroupId?: string;
			question?: PendingQuestion;
			sessionId: string;
			text: string;
	  }
> => {
	const session = await getEveSessionBySessionId({ db, orgId, sessionId });
	if (!session) return { error: true, message: "Eve session not found." };
	// An answered question can chain straight into gated writes.
	const { chainedGroupId, question, text } = await answerParkedRequests({
		auth,
		orgId,
		providerUserId: auth.providerUserId,
		responses: [{ optionId, requestId }],
		session,
	});
	return { chainedGroupId, question, sessionId: session.sessionId, text };
};

export const resumeEveApprovalGroup = async ({
	approvals,
	providerUserId,
}: {
	approvals: ChatApproval[];
	onProgress?: (statusLine: string) => void;
	providerUserId: string;
}): Promise<ApprovalGroupRunResult> =>
	answerEveApprovals({
		approvals,
		expectExecution: true,
		optionIdFor: approveOptionFromApproval,
		providerUserId,
	});

/** Deny the parked tool calls in Eve, not just locally. Without this the
 * session stays waiting on the stale approvals: Eve holds the user's next
 * message behind them, and the discarded writes can still execute later. */
export const denyEveApprovalGroup = async ({
	approvals,
	providerUserId,
}: {
	approvals: ChatApproval[];
	providerUserId: string;
}): Promise<ApprovalGroupRunResult> =>
	answerEveApprovals({
		approvals,
		note: "(Dashboard: the user clicked Discard on this change. Acknowledge briefly and ask what they'd like different — they are NOT waiting on any further approval.)",
		optionIdFor: denyOptionFromApproval,
		providerUserId,
	});
