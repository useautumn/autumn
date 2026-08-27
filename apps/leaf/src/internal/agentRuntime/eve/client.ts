import { ms } from "@autumn/shared";
import type { SendTurnPayload } from "eve/client";
import { Client, ClientError } from "eve/client";
import { env } from "../../../lib/env.js";
import { logger } from "../../../lib/logger.js";
import { withRetry } from "../../../lib/withRetry.js";
import { STREAM_IDLE_TIMEOUT_MS } from "../turnBudget.js";
import { type EveEvent, parseEveEvent } from "./eveEventSchemas.js";
import { idleGuardedStream } from "./idleGuardedStream.js";
import {
	isConnectionRefusedError,
	isRetryableEveStreamError,
} from "./streamErrors.js";
import type { EveAuthContext, EveSessionRef } from "./types.js";
import { sessionEventCount } from "./world/sessionStream.js";

// Eve keeps the attribute for the session's life, so only creation sends it.
const eveHeaders = (
	auth: EveAuthContext,
	{ withOrgCatalog = false }: { withOrgCatalog?: boolean } = {},
): Record<string, string> => {
	const headers: Record<string, string> = {
		authorization: `Bearer ${env.EVE_INTERNAL_AUTH_TOKEN}`,
		"x-leaf-app-env": String(auth.appEnv),
		"x-leaf-channel-id": auth.channelId,
		"x-leaf-org-id": auth.orgId,
		"x-leaf-provider": auth.provider,
		"x-leaf-provider-user-id": auth.providerUserId,
		"x-leaf-thread-id": auth.threadId,
		"x-leaf-user-id": auth.providerUserId,
		"x-leaf-workspace-id": auth.workspaceId,
	};
	if (auth.chatInstallationId) {
		headers["x-leaf-chat-installation-id"] = auth.chatInstallationId;
	}
	if (auth.autumnUserId) {
		headers["x-leaf-autumn-user-id"] = auth.autumnUserId;
	}
	if (auth.orgInstructions) {
		headers["x-leaf-org-instructions"] = Buffer.from(
			auth.orgInstructions,
		).toString("base64url");
	}
	if (withOrgCatalog && auth.orgCatalog) {
		headers["x-leaf-org-catalog"] = Buffer.from(auth.orgCatalog).toString(
			"base64url",
		);
	}
	return headers;
};

const eveClient = ({
	auth,
	withOrgCatalog = false,
}: {
	auth: EveAuthContext;
	withOrgCatalog?: boolean;
}) =>
	new Client({
		headers: () => eveHeaders(auth, { withOrgCatalog }),
		host: env.EVE_SERVER_URL,
		preserveCompletedSessions: true,
	});

/** Eve lost the session behind our continuation token — every further post
 * fails identically, so drop the session rather than retry. */
export class EveSessionGoneError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EveSessionGoneError";
	}
}

const POST_RETRY_ATTEMPTS = 2;
const POST_RETRY_BASE_DELAY_MS = ms.seconds(0.5);

const SESSION_GONE_PATTERN =
	/not found via continuation token|session (was )?not found/i;

const rethrowAsSessionGone = (error: unknown): never => {
	if (error instanceof ClientError) {
		if (error.status === 404 || SESSION_GONE_PATTERN.test(error.body)) {
			throw new EveSessionGoneError(
				`Eve session is gone (${error.status}): ${error.body.slice(0, 200)}`,
			);
		}
		throw new Error(
			`Eve session request failed: ${error.status}${error.body ? ` ${error.body.slice(0, 200)}` : ""}`,
		);
	}
	throw error;
};

const postedSessionFrom = ({
	existing,
	response,
}: {
	existing?: EveSessionRef;
	response: { continuationToken?: string; sessionId: string };
}) => {
	if (!response.sessionId) throw new Error("Eve did not return a session id");
	const continuationToken =
		response.continuationToken ?? existing?.state.continuationToken;
	if (!continuationToken) {
		throw new Error("Eve did not return a continuation token");
	}
	return { continuationToken, sessionId: response.sessionId };
};

export type EveFilePart = {
	data: string;
	filename?: string;
	mediaType: string;
	type: "file";
};

export type EveMessageContent =
	| string
	| Array<{ text: string; type: "text" } | EveFilePart>;

/** Leaf's context bags are plain JSON-serializable records; the SDK's stricter
 * JsonObject cannot be proven structurally from `unknown` values. */
const asJsonObject = (value: Record<string, unknown>) =>
	value as unknown as NonNullable<SendTurnPayload["clientContext"]>;

export const postEveMessage = async ({
	auth,
	clientContext,
	inputResponses,
	message,
	session,
}: {
	auth: EveAuthContext;
	clientContext?: Record<string, unknown>;
	inputResponses?: { optionId: string; requestId: string }[];
	message?: EveMessageContent;
	session?: EveSessionRef;
}) => {
	const client = eveClient({ auth, withOrgCatalog: !session });
	const post = () =>
		client
			.session(
				session
					? {
							continuationToken: session.state.continuationToken,
							sessionId: session.sessionId,
							streamIndex: session.state.streamIndex,
						}
					: undefined,
			)
			.send({
				clientContext: clientContext && asJsonObject(clientContext),
				inputResponses,
				message,
			});
	const response = await withRetry({
		attempts: POST_RETRY_ATTEMPTS,
		baseDelayMs: POST_RETRY_BASE_DELAY_MS,
		onRecovered: ({ attempt }) => {
			logger.info("Eve session post recovered after retry", {
				event: "leaf.eve_post_recovered",
				data: { attempts_used: attempt, session_id: session?.sessionId },
			});
		},
		onRetry: ({ attempt, error }) => {
			logger.warn("Eve session post failed; retrying", {
				data: { attempt, session_id: session?.sessionId },
				error,
				event: "leaf.eve_post_retry",
			});
		},
		operation: post,
		shouldRetry: (error) =>
			isConnectionRefusedError(error) ||
			(!session && isRetryableEveStreamError(error)),
	}).catch(rethrowAsSessionGone);
	return postedSessionFrom({ existing: session, response });
};

/** Written to the model, not the user: the siblings are denied for a procedural
 * reason, and without saying so the model reads six denials as six rejections. */
export const SIBLING_WITHHELD_NOTE =
	"(The other pending write approvals in this batch were withheld, not rejected on their merits — approvals are shown to the user one at a time. Re-issue each withheld write as its own separate step so the user can approve it individually.)";

/** Answers a parked request AND its siblings (eve defers all deliveries until
 * the whole batch is answered); each sibling needs its own valid option id. */
export const postEveInputResponse = async ({
	approveSiblings,
	auth,
	note,
	optionId,
	requestId,
	session,
	siblingOptionIdFor,
	siblingRequestIds,
}: {
	approveSiblings?: boolean;
	auth: EveAuthContext;
	note?: string;
	optionId: string;
	requestId: string;
	session: EveSessionRef;
	siblingOptionIdFor?: (siblingRequestId: string) => string | undefined;
	siblingRequestIds?: ReadonlyArray<string>;
}) => {
	const siblings = [...new Set(siblingRequestIds ?? [])].filter(
		(siblingRequestId) => siblingRequestId && siblingRequestId !== requestId,
	);
	const client = eveClient({ auth });
	const post = () =>
		client
			.session({
				continuationToken: session.state.continuationToken,
				sessionId: session.sessionId,
				streamIndex: session.state.streamIndex,
			})
			.send({
				inputResponses: [
					{ optionId, requestId },
					...siblings.map((siblingRequestId) => ({
						optionId: approveSiblings
							? optionId
							: (siblingOptionIdFor?.(siblingRequestId) ?? "deny"),
						requestId: siblingRequestId,
					})),
				],
				message:
					siblings.length && !approveSiblings
						? [note, SIBLING_WITHHELD_NOTE].filter(Boolean).join("\n\n")
						: note,
			});
	const response = await withRetry({
		attempts: POST_RETRY_ATTEMPTS,
		baseDelayMs: POST_RETRY_BASE_DELAY_MS,
		onRetry: ({ attempt, error }) => {
			logger.warn("Eve input response post failed; retrying", {
				data: { attempt, session_id: session.sessionId },
				error,
				event: "leaf.eve_post_retry",
			});
		},
		operation: post,
		shouldRetry: isConnectionRefusedError,
	}).catch(rethrowAsSessionGone);
	return postedSessionFrom({ existing: session, response });
};

export class EveStreamIdleTimeoutError extends Error {
	constructor(sessionId: string) {
		super(`Eve stream idle timeout for session ${sessionId}`);
	}
}

export class EveStreamDisconnectedError extends Error {
	constructor(error: unknown) {
		super(error instanceof Error ? error.message : String(error));
		this.name = "EveStreamDisconnectedError";
	}
}

/** The session answers on the wire but never emits again: reconnects exhaust
 * with zero events. Distinct from a flaky transport — it will never recover. */
export class EveSessionDeadError extends Error {
	constructor(sessionId: string) {
		super(`Eve session ${sessionId} is dead: no events across every reconnect`);
		this.name = "EveSessionDeadError";
	}
}

export const isEveTransportLost = (error: unknown) =>
	error instanceof EveStreamDisconnectedError ||
	error instanceof EveStreamIdleTimeoutError;

export async function* streamEveEvents({
	auth,
	idleTimeoutMs = STREAM_IDLE_TIMEOUT_MS,
	session,
	signal,
}: {
	auth: EveAuthContext;
	idleTimeoutMs?: number;
	session: EveSessionRef;
	signal?: AbortSignal;
}): AsyncGenerator<EveEvent> {
	logger.info("Opening eve event stream", {
		event: "leaf.eve_stream_opened",
		data: {
			session_id: session.sessionId,
			source: "http",
			start_index: session.state.streamIndex,
		},
	});
	try {
		yield* idleGuardedStream({
			idleTimeoutMs,
			onIdleTimeout: () => new EveStreamIdleTimeoutError(session.sessionId),
			open: (upstreamSignal) =>
				openEveStream({ auth, session, signal: upstreamSignal }),
			signal,
		});
	} catch (error) {
		if (isRetryableEveStreamError(error)) {
			throw new EveStreamDisconnectedError(error);
		}
		throw error;
	}
}

/** A fresh client session per open keeps leaf's own ref the sole cursor
 * authority — the SDK rewinds its copy to 0 on a completed boundary. */
async function* openEveStream({
	auth,
	session,
	signal,
}: {
	auth: EveAuthContext;
	session: EveSessionRef;
	signal: AbortSignal;
}): AsyncGenerator<EveEvent> {
	const stream = eveClient({ auth })
		.session({
			continuationToken: session.state.continuationToken,
			sessionId: session.sessionId,
			streamIndex: session.state.streamIndex,
		})
		.stream({ signal, startIndex: session.state.streamIndex });
	for await (const event of stream) {
		yield parseEveEvent(event);
	}
}

// Spots the end of a buffered replay; every resumed turn pays it up front.
const REPLAY_QUIET_GAP_MS = ms.seconds(0.25);

const countEveReplayableEvents = async ({
	auth,
	sessionId,
}: {
	auth: EveAuthContext;
	sessionId: string;
}) => {
	const controller = new AbortController();
	let quietTimer = setTimeout(() => controller.abort(), REPLAY_QUIET_GAP_MS);
	let count = 0;
	try {
		const stream = eveClient({ auth })
			.session({ sessionId, streamIndex: 0 })
			.stream({ signal: controller.signal, startIndex: 0 });
		for await (const _event of stream) {
			clearTimeout(quietTimer);
			quietTimer = setTimeout(() => controller.abort(), REPLAY_QUIET_GAP_MS);
			count += 1;
		}
	} catch (error) {
		const quietGapReached =
			error instanceof Error && error.name === "AbortError";
		if (!quietGapReached) {
			logger.warn("Eve replay recount failed", {
				data: { session_id: sessionId },
				error,
				event: "leaf.eve_replay_count_failed",
			});
		}
	} finally {
		clearTimeout(quietTimer);
	}
	return count;
};

/** Exact from the journal when the world is reachable, else counted from a
 * replay of eve's in-memory buffer (which may be short or empty). */
const journaledEventCount = async ({
	auth,
	sessionId,
}: {
	auth: EveAuthContext;
	sessionId: string;
}): Promise<{ count: number; exact: boolean }> => {
	const exact = await sessionEventCount(sessionId).catch((error: unknown) => {
		logger.warn("Eve journal count failed; falling back to replay count", {
			event: "leaf.eve_event_count_failed",
			data: { session_id: sessionId },
			error,
		});
		return undefined;
	});
	if (exact !== undefined) return { count: exact, exact: true };
	return {
		count: await countEveReplayableEvents({ auth, sessionId }),
		exact: false,
	};
};

const moveStreamCursor = ({
	event,
	session,
	to,
}: {
	event: string;
	session: EveSessionRef;
	to: number;
}) => {
	const from = session.state.streamIndex;
	if (from === to) return;
	session.state.streamIndex = to;
	logger.info("Moved eve stream cursor", {
		event,
		data: { from, session_id: session.sessionId, to },
	});
};

/** Heals cursor overshoot (eve streams events it never persists). Only ever
 * lowers the cursor — a zero/failed recount must not force a full replay. */
export const resyncEveStreamIndex = async ({
	auth,
	session,
}: {
	auth: EveAuthContext;
	session: EveSessionRef;
}) => {
	const { count, exact } = await journaledEventCount({
		auth,
		sessionId: session.sessionId,
	});
	if (!exact && count === 0) return;
	moveStreamCursor({
		event: "leaf.eve_cursor_resynced",
		session,
		to: Math.min(session.state.streamIndex, count),
	});
};

/** A new message makes everything in eve's log a previous turn's leftovers —
 * fast-forward so stale text can never replay as this turn's reply. */
export const fastForwardEveStreamIndex = async ({
	auth,
	session,
}: {
	auth: EveAuthContext;
	session: EveSessionRef;
}) => {
	const { count, exact } = await journaledEventCount({
		auth,
		sessionId: session.sessionId,
	});
	moveStreamCursor({
		event: "leaf.eve_cursor_fast_forwarded",
		session,
		to: exact ? count : Math.max(session.state.streamIndex, count),
	});
};
