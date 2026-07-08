import type { ChatApproval } from "@autumn/shared";
import { normalizeToolName } from "../../agent/tools/toolPolicy.js";
import { chatApprovalRepo } from "../../internal/approvals/repos/chatApprovalRepo.js";
import type { ApprovalRunResult } from "../../internal/approvals/types.js";
import { fetchApprovalPreview } from "../../internal/approvals/utils/fetchApprovalPreview.js";
import { getOrgInstallationToken } from "../../internal/installations/actions/getOrgInstallationToken.js";
import { db } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import {
	EveStreamIdleTimeoutError,
	postEveInputResponse,
	resyncEveStreamIndex,
	streamEveEvents,
} from "./client.js";
import { approvalOptionIds, type EveInputRequest } from "./events.js";
import { getEveSessionBySessionId, upsertEveSession } from "./repo.js";
import type { EveAuthContext, EveSessionRef } from "./types.js";

/** A gated write the resumed turn parked on after the answered one. */
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
	let turnStarted = false;
	while (true) {
		let parkedAgain = false;
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
					const requests = (event.data?.requests ?? []) as EveInputRequest[];
					const gated = requests.find(
						(request) =>
							request.requestId &&
							request.action?.toolName &&
							normalizeToolName(request.action.toolName) !== "ask_question",
					);
					if (gated?.requestId && denies < MAX_DRAIN_DENIES) {
						denies += 1;
						const options = approvalOptionIds(gated);
						const posted = await postEveInputResponse({
							auth,
							note: DRAIN_DENY_NOTE,
							optionId: options.deny,
							requestId: gated.requestId,
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
			// The resumed turn can chain straight into another gated write, parked
			// where nobody streams. Capture it so a fresh approval row exists.
			const requests = (event.data?.requests ?? []) as EveInputRequest[];
			const found = requests.find(
				(request) =>
					request.requestId &&
					request.requestId !== skipRequestId &&
					request.action?.toolName &&
					normalizeToolName(request.action.toolName) !== "ask_question",
			);
			if (found?.requestId && found.action?.toolName) {
				chained = {
					input: found.action.input,
					options: found.options,
					requestId: found.requestId,
					toolName: found.action.toolName,
				};
				break;
			}
			// An optioned ask_question also parks the session — capture it so
			// button-driven surfaces can render answer chips instead of dead text.
			const optioned = requests.find(
				(request) =>
					request.requestId !== skipRequestId &&
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

const answerEveApproval = async ({
	approval,
	note,
	optionId,
	providerUserId,
}: {
	approval: ChatApproval;
	note?: string;
	optionId: string;
	providerUserId: string;
}): Promise<ApprovalRunResult> => {
	if (!approval.run_id || !approval.tool_call_id) {
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
	const auth = authFromApproval(approval, providerUserId);
	const posted = await postEveInputResponse({
		auth,
		note,
		optionId,
		requestId: approval.tool_call_id,
		session,
	});
	session.sessionId = posted.sessionId;
	session.state.continuationToken = posted.continuationToken;
	session.state.status = "running";
	await upsertEveSession({
		db,
		env: session.env,
		orgId: approval.org_id,
		sessionId: session.sessionId,
		state: session.state,
		threadKey: session.threadKey,
	});
	const { chained, question, text } = await collectText({
		auth,
		orgId: approval.org_id,
		session,
		skipRequestId: approval.tool_call_id,
	});
	const chainedApprovalId = chained
		? await insertChainedApproval({
				auth,
				chained,
				providerUserId,
				sessionId: session.sessionId,
			})
		: undefined;
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
}: {
	auth: EveAuthContext;
	chained: ChainedPendingRequest;
	providerUserId: string;
	sessionId: string;
}) => {
	const env = auth.appEnv as ChatApproval["env"];
	const provider = auth.provider as ChatApproval["provider"];
	const options = approvalOptionIds({ options: chained.options });
	let preview: unknown;
	try {
		const { accessToken } = await getOrgInstallationToken({
			env,
			orgId: auth.orgId,
			provider,
			userId: providerUserId,
			workspaceId: auth.workspaceId,
		});
		const input = chained.input ?? {};
		const request =
			input.request && typeof input.request === "object"
				? (input.request as Record<string, unknown>)
				: input;
		preview = await fetchApprovalPreview({
			env,
			logger,
			request,
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
	const posted = await postEveInputResponse({
		auth,
		optionId,
		requestId,
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
		skipRequestId: requestId,
	});
	// An answered question can chain straight into a gated write.
	const chainedApprovalId = chained
		? await insertChainedApproval({
				auth,
				chained,
				providerUserId: auth.providerUserId,
				sessionId: session.sessionId,
			})
		: undefined;
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
