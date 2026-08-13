import type { ChatApproval } from "@autumn/shared";
import { chatApprovalRepo } from "../../internal/approvals/repos/chatApprovalRepo.js";
import type { ApprovalGroupRunResult } from "../../internal/approvals/types.js";
import { fetchApprovalPreview } from "../../internal/approvals/utils/fetchApprovalPreview.js";
import { getOrgInstallationToken } from "../../internal/installations/actions/getOrgInstallationToken.js";
import { db } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import {
	EveStreamIdleTimeoutError,
	postEveInputResponses,
	resyncEveStreamIndex,
	streamEveEvents,
} from "./client.js";
import {
	approvalOptionIds,
	type EveInputRequest,
	isGatedRequest,
} from "./events.js";
import { getEveSessionBySessionId, upsertEveSession } from "./repo.js";
import type { EveAuthContext, EveSessionRef } from "./types.js";

/** A gated write the resumed turn parked on after the answered ones. */
export type ChainedPendingRequest = {
	input?: Record<string, unknown>;
	options?: { id?: string; label?: string }[];
	requestId: string;
	toolName: string;
};

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

const gatedRequestsFrom = ({
	event,
	skipRequestIds,
}: {
	event: { data?: Record<string, unknown> };
	skipRequestIds?: Set<string>;
}): ChainedPendingRequest[] =>
	((event.data?.requests ?? []) as EveInputRequest[])
		.filter(
			(request) =>
				isGatedRequest(request) &&
				!skipRequestIds?.has(request.requestId ?? ""),
		)
		.map((request) => ({
			input: request.action?.input,
			options: request.options,
			requestId: request.requestId as string,
			toolName: request.action?.toolName as string,
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
					const gated = gatedRequestsFrom({ event });
					if (gated.length > 0 && denies < MAX_DRAIN_DENIES) {
						denies += 1;
						const posted = await postEveInputResponses({
							auth,
							note: DRAIN_DENY_NOTE,
							responses: gated.map((request) => ({
								optionId: approvalOptionIds({ options: request.options }).deny,
								requestId: request.requestId,
							})),
							session,
						});
						session.sessionId = posted.sessionId;
						session.state.continuationToken = posted.continuationToken;
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
			optionId:
				typeof suspension.toolArgs._eveDenyOptionId === "string"
					? suspension.toolArgs._eveDenyOptionId
					: "deny",
			requestId: suspension.toolCallId as string,
		})),
		session,
	});
	session.sessionId = posted.sessionId;
	session.state.continuationToken = posted.continuationToken;
	session.state.status = "running";
	await drainParkedEveTurn({ auth, orgId, session });
	return true;
};

/** An optioned ask_question the resumed turn parked on. */
export type PendingQuestion = {
	options: { id?: string; label?: string }[];
	prompt: string;
	requestId: string;
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
	// Stale tail events from the parked turn replay first (see engine.ts) —
	// only honor terminal events once the resumed turn's turn.started arrives.
	let turnStarted = false;
	for await (const event of streamEveEvents({ auth, session })) {
		session.state.streamIndex += 1;
		session.state.lastEventAt = Date.now();
		if (event.type === "turn.started") {
			turnStarted = true;
		} else if (event.type === "input.requested") {
			// The resumed turn can chain straight into more gated writes, parked
			// where nobody streams. Capture them so fresh approval rows exist.
			const found = gatedRequestsFrom({ event, skipRequestIds });
			if (found.length > 0) {
				chained = found;
				break;
			}
			// An optioned ask_question also parks the session — capture it so
			// button-driven surfaces can render answer chips instead of dead text.
			const optioned = ((event.data?.requests ?? []) as EveInputRequest[]).find(
				(request) =>
					!skipRequestIds?.has(request.requestId ?? "") &&
					request.prompt &&
					(request.options?.length ?? 0) > 0,
			);
			if (optioned?.requestId && optioned.prompt) {
				question = {
					options: optioned.options ?? [],
					prompt: optioned.prompt,
					requestId: optioned.requestId,
				};
				session.state.status = "waiting";
				break;
			}
		} else if (event.type === "message.appended" && turnStarted) {
			const messageSoFar = event.data?.messageSoFar;
			pendingText =
				typeof messageSoFar === "string"
					? messageSoFar
					: `${pendingText}${String(event.data?.messageDelta ?? "")}`;
		} else if (event.type === "message.completed" && turnStarted) {
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
	await upsertEveSession({
		db,
		env: session.env,
		orgId,
		sessionId: session.sessionId,
		state: session.state,
		threadKey: session.threadKey,
	});
	return { chained, question, text: text || pendingText };
};

/** Answers every approval in the group in one POST — answering them one at a
 * time would resume the turn while its siblings are still parked. */
const answerEveApprovals = async ({
	approvals,
	note,
	optionIdFor,
	providerUserId,
}: {
	approvals: ChatApproval[];
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
	const auth = authFromApproval(first, providerUserId);
	const posted = await postEveInputResponses({
		auth,
		note,
		responses: approvals.map((approval) => ({
			optionId: optionIdFor(approval),
			requestId: approval.tool_call_id as string,
		})),
		session,
	});
	session.sessionId = posted.sessionId;
	session.state.continuationToken = posted.continuationToken;
	session.state.status = "running";
	await upsertEveSession({
		db,
		env: session.env,
		orgId: first.org_id,
		sessionId: session.sessionId,
		state: session.state,
		threadKey: session.threadKey,
	});
	const { chained, question, text } = await collectText({
		auth,
		orgId: first.org_id,
		session,
		skipRequestIds: new Set(
			approvals.map((approval) => approval.tool_call_id as string),
		),
	});
	const chainedGroupId = chained.length
		? await insertChainedApprovalGroup({
				auth,
				chained,
				providerUserId,
				sessionId: session.sessionId,
			})
		: undefined;
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
			const input = request.input ?? {};
			const body =
				input.request && typeof input.request === "object"
					? (input.request as Record<string, unknown>)
					: input;
			return await fetchApprovalPreview({
				env,
				logger,
				request: body,
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
	const posted = await postEveInputResponses({
		auth,
		responses: [{ optionId, requestId }],
		session,
	});
	session.sessionId = posted.sessionId;
	session.state.continuationToken = posted.continuationToken;
	session.state.status = "running";
	await upsertEveSession({
		db,
		env: session.env,
		orgId,
		sessionId: session.sessionId,
		state: session.state,
		threadKey: session.threadKey,
	});
	const { chained, question, text } = await collectText({
		auth,
		orgId,
		session,
		skipRequestIds: new Set([requestId]),
	});
	// An answered question can chain straight into gated writes.
	const chainedGroupId = chained.length
		? await insertChainedApprovalGroup({
				auth,
				chained,
				providerUserId: auth.providerUserId,
				sessionId: session.sessionId,
			})
		: undefined;
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
