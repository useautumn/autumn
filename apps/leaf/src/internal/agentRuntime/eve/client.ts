import { ms } from "@autumn/shared";
import { env } from "../../../lib/env.js";
import { logger } from "../../../lib/logger.js";
import { withRetry } from "../../../lib/withRetry.js";
import { type EveEvent, parseEveEvent } from "./eveEventSchemas.js";
import {
	isConnectionRefusedError,
	isRetryableEveStreamError,
} from "./streamErrors.js";
import type { EveAuthContext, EveSessionRef } from "./types.js";

const eveUrl = (path: string) => new URL(path, env.EVE_SERVER_URL).href;

const eveHeaders = (auth: EveAuthContext, init?: HeadersInit) => {
	const headers = new Headers(init);
	headers.set("authorization", `Bearer ${env.EVE_INTERNAL_AUTH_TOKEN}`);
	headers.set("x-leaf-app-env", String(auth.appEnv));
	headers.set("x-leaf-org-id", auth.orgId);
	headers.set("x-leaf-provider", auth.provider);
	headers.set("x-leaf-provider-user-id", auth.providerUserId);
	headers.set("x-leaf-user-id", auth.providerUserId);
	headers.set("x-leaf-workspace-id", auth.workspaceId);
	headers.set("x-leaf-channel-id", auth.channelId);
	headers.set("x-leaf-thread-id", auth.threadId);
	if (auth.chatInstallationId) {
		headers.set("x-leaf-chat-installation-id", auth.chatInstallationId);
	}
	if (auth.autumnUserId) {
		headers.set("x-leaf-autumn-user-id", auth.autumnUserId);
	}
	if (auth.orgInstructions) {
		headers.set(
			"x-leaf-org-instructions",
			Buffer.from(auth.orgInstructions).toString("base64url"),
		);
	}
	return headers;
};

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

const parseSessionResponse = async ({
	existing,
	response,
}: {
	existing?: EveSessionRef;
	response: Response;
}) => {
	if (!response.ok) {
		const body = await response.text().catch(() => "");
		if (response.status === 404 || SESSION_GONE_PATTERN.test(body)) {
			throw new EveSessionGoneError(
				`Eve session is gone (${response.status}): ${body.slice(0, 200)}`,
			);
		}
		throw new Error(
			`Eve session request failed: ${response.status}${body ? ` ${body.slice(0, 200)}` : ""}`,
		);
	}
	const body = (await response.json()) as {
		continuationToken?: string;
		sessionId?: string;
	};
	const sessionId = body.sessionId ?? response.headers.get("x-eve-session-id");
	if (!sessionId) throw new Error("Eve did not return a session id");
	const continuationToken =
		body.continuationToken ?? existing?.state.continuationToken;
	if (!continuationToken) {
		throw new Error("Eve did not return a continuation token");
	}
	return { continuationToken, sessionId };
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
	const post = () =>
		fetch(
			session
				? eveUrl(`/eve/v1/session/${session.sessionId}`)
				: eveUrl("/eve/v1/session"),
			{
				method: "POST",
				headers: eveHeaders(auth, { "content-type": "application/json" }),
				body: JSON.stringify(
					session
						? {
								clientContext,
								continuationToken: session.state.continuationToken,
								inputResponses,
								message,
							}
						: { clientContext, message },
				),
			},
		);
	// Mid-flight drops are only retried for NEW sessions, where a duplicate
	// creates an orphan rather than a double-delivered message.
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
	});
	return parseSessionResponse({ existing: session, response });
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
	suppressSiblingWithheldNote,
}: {
	approveSiblings?: boolean;
	auth: EveAuthContext;
	note?: string;
	optionId: string;
	requestId: string;
	session: EveSessionRef;
	siblingOptionIdFor?: (siblingRequestId: string) => string | undefined;
	siblingRequestIds?: ReadonlyArray<string>;
	suppressSiblingWithheldNote?: boolean;
}) => {
	const siblings = [...new Set(siblingRequestIds ?? [])].filter(
		(siblingRequestId) => siblingRequestId && siblingRequestId !== requestId,
	);
	const response = await fetch(eveUrl(`/eve/v1/session/${session.sessionId}`), {
		method: "POST",
		headers: eveHeaders(auth, { "content-type": "application/json" }),
		body: JSON.stringify({
			continuationToken: session.state.continuationToken,
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
				siblings.length && !approveSiblings && !suppressSiblingWithheldNote
					? [note, SIBLING_WITHHELD_NOTE].filter(Boolean).join("\n\n")
					: note,
		}),
	});
	return parseSessionResponse({ existing: session, response });
};

/** Longest observed gap between events on a healthy turn is ~60s (model
 * latency on a large context), so anything past this reads as a dead stream. */
const STREAM_IDLE_TIMEOUT_MS = ms.minutes(2);

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
	const streamUrl = eveUrl(
		`/eve/v1/session/${session.sessionId}/stream?startIndex=${session.state.streamIndex}`,
	);
	// A stream past eve's replay buffer stays open and silent forever — no
	// bytes within the idle window aborts as EveStreamIdleTimeoutError.
	const controller = new AbortController();
	const abortUpstream = () => controller.abort();
	signal?.addEventListener("abort", abortUpstream, { once: true });
	let timedOut = false;
	const armIdleTimer = () =>
		setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, idleTimeoutMs);
	let idleTimer = armIdleTimer();
	try {
		const response = await fetch(streamUrl, {
			headers: eveHeaders(auth),
			signal: controller.signal,
		});
		if (!response.ok || !response.body) {
			throw new Error(`Eve stream failed: ${response.status}`);
		}

		const decoder = new TextDecoder();
		let buffer = "";
		for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
			clearTimeout(idleTimer);
			idleTimer = armIdleTimer();
			buffer += decoder.decode(chunk, { stream: true });
			let newlineIndex = buffer.indexOf("\n");
			while (newlineIndex >= 0) {
				const line = buffer.slice(0, newlineIndex).trim();
				buffer = buffer.slice(newlineIndex + 1);
				newlineIndex = buffer.indexOf("\n");
				if (line) yield parseEveEvent(JSON.parse(line));
			}
		}
	} catch (error) {
		if (timedOut) throw new EveStreamIdleTimeoutError(session.sessionId);
		if (isRetryableEveStreamError(error)) {
			throw new EveStreamDisconnectedError(error);
		}
		throw error;
	} finally {
		clearTimeout(idleTimer);
		signal?.removeEventListener("abort", abortUpstream);
	}
}

const REPLAY_QUIET_GAP_MS = ms.seconds(2);

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
		const response = await fetch(
			eveUrl(`/eve/v1/session/${sessionId}/stream?startIndex=0`),
			{ headers: eveHeaders(auth), signal: controller.signal },
		);
		if (!response.ok || !response.body) return count;
		const decoder = new TextDecoder();
		let buffer = "";
		for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
			clearTimeout(quietTimer);
			quietTimer = setTimeout(() => controller.abort(), REPLAY_QUIET_GAP_MS);
			buffer += decoder.decode(chunk, { stream: true });
			let newlineIndex = buffer.indexOf("\n");
			while (newlineIndex >= 0) {
				const line = buffer.slice(0, newlineIndex).trim();
				buffer = buffer.slice(newlineIndex + 1);
				newlineIndex = buffer.indexOf("\n");
				if (line) count += 1;
			}
		}
	} catch (error) {
		// Aborting on the quiet gap is the normal exit.
		if (!(error instanceof Error && error.name === "AbortError")) {
			logger.warn("Eve replay recount failed", {
				data: { error, session_id: sessionId },
				event: "leaf.eve_replay_count_failed",
			});
		}
	} finally {
		clearTimeout(quietTimer);
	}
	return count;
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
	const replayCount = await countEveReplayableEvents({
		auth,
		sessionId: session.sessionId,
	});
	if (replayCount > 0 && replayCount < session.state.streamIndex) {
		session.state.streamIndex = replayCount;
	}
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
	try {
		const replayCount = await countEveReplayableEvents({
			auth,
			sessionId: session.sessionId,
		});
		if (replayCount > session.state.streamIndex) {
			session.state.streamIndex = replayCount;
		}
	} catch {
		return;
	}
};
