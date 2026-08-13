import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import type { ActiveRun } from "../../internal/runs/runRegistry.js";
import {
	applyEveEvent,
	closeReasoningStream,
	type EveEventContext,
	type EveTurnOutcome,
	type EveTurnProgress,
} from "./applyEveEvent.js";
import {
	EveStreamDisconnectedError,
	EveStreamIdleTimeoutError,
	resyncEveStreamIndex,
	streamEveEvents,
} from "./client.js";
import { saveEveSessionState } from "./sessionState.js";
import { eveTurnProducedOutput } from "./turnOutput.js";
import type { EveAuthContext, EveSessionRef } from "./types.js";

/** ~10s of reconnects (doubled once by the silent-cursor resync below): eve
 * resumes turns asynchronously, so the first stream after a post can
 * legitimately close empty a few times. */
const MAX_IDLE_RETRIES = 20;
const STREAM_RETRY_DELAY_MS = 500;
const MAX_STREAM_DISCONNECT_RETRIES = 5;
const PERSIST_CURSOR_EVERY_EVENTS = 10;

/**
 * Streams one eve turn to its end. Reconnects through eve's async resume
 * window and heals a drifted cursor; throws only when the turn failed or the
 * stream died with nothing to show for it.
 */
export const consumeEveTurn = async ({
	auth,
	env,
	logger,
	onAction,
	onReasoning,
	onThinking,
	orgId,
	run,
	session,
	token,
}: {
	auth: EveAuthContext;
	env: AppEnv;
	logger: AutumnLogger;
	onAction?: EveEventContext["onAction"];
	onReasoning?: EveEventContext["onReasoning"];
	onThinking?: EveEventContext["onThinking"];
	orgId: string;
	run?: ActiveRun;
	session: EveSessionRef;
	token: string;
}): Promise<EveTurnOutcome> => {
	const abortController = new AbortController();
	const progress: EveTurnProgress = {
		finalText: "",
		lastPreview: undefined,
		pendingText: "",
		toolInputs: new Map(),
		toolLabels: new Map(),
		turnStarted: false,
	};
	let streamedAnyEvent = false;
	let resyncedAfterSilence = false;
	let idleRetries = 0;
	let disconnectRetries = 0;

	const abandonForStop = async (
		stop: NonNullable<ActiveRun["stop"]>,
	): Promise<EveTurnOutcome> => {
		abortController.abort();
		await saveEveSessionState({ orgId, session, state: { status: "waiting" } });
		return {
			kind: "stopped",
			stopReason: stop.reason,
			text: progress.finalText,
		};
	};

	try {
		while (idleRetries < MAX_IDLE_RETRIES) {
			// Eve is never interrupted server-side, so a stop is only honored where
			// the harness looks: here, and on the next streamed event.
			if (run?.stop) return await abandonForStop(run.stop);
			let sawEvent = false;
			try {
				for await (const event of streamEveEvents({
					auth,
					session,
					signal: abortController.signal,
				})) {
					sawEvent = true;
					// Recorded per event rather than after the stream closes — a stream
					// that yields events and then drops must not look silent.
					streamedAnyEvent = true;
					session.state.streamIndex += 1;
					session.state.lastEventAt = Date.now();

					if (run?.stop) return await abandonForStop(run.stop);

					const outcome = await applyEveEvent({
						env,
						event,
						onAction,
						onReasoning,
						onThinking,
						orgId,
						progress,
						session,
						token,
					});
					if (outcome) return outcome;

					if (session.state.streamIndex % PERSIST_CURSOR_EVERY_EVENTS === 0) {
						await saveEveSessionState({ orgId, session });
					}
				}
			} catch (error) {
				if (error instanceof EveStreamDisconnectedError) {
					disconnectRetries += 1;
					logger.warn("Eve stream disconnected; reconnecting", {
						event: "leaf.eve_stream_disconnected",
						data: {
							attempt: disconnectRetries,
							error: error.message,
							session_id: session.sessionId,
							stream_index: session.state.streamIndex,
						},
					});
					if (disconnectRetries >= MAX_STREAM_DISCONNECT_RETRIES) throw error;
					continue;
				}
				if (!(error instanceof EveStreamIdleTimeoutError)) throw error;
				// Silence this long means the cursor drifted past eve's replay buffer
				// or the turn died without a terminal event — heal the cursor and
				// fail visibly rather than spin forever.
				logger.warn("Eve stream went idle; resyncing cursor", {
					event: "leaf.eve_stream_idle_timeout",
					data: {
						session_id: session.sessionId,
						stream_index: session.state.streamIndex,
					},
				});
				await resyncEveStreamIndex({ auth, session });
				await saveEveSessionState({
					orgId,
					session,
					state: { status: "waiting" },
				});
				const partialText = progress.finalText || progress.pendingText;
				if (partialText) {
					closeReasoningStream({ onReasoning, progress });
					return { kind: "answered", text: partialText };
				}
				throw new Error(
					"Eve stopped responding mid-turn — please send your message again.",
				);
			}

			idleRetries = sawEvent ? 0 : idleRetries + 1;
			// Nothing at all came back: the cursor may have drifted past eve's
			// replay buffer, so heal it once and re-arm the budget.
			const silentlyExhausted =
				idleRetries >= MAX_IDLE_RETRIES &&
				!(streamedAnyEvent || resyncedAfterSilence);
			if (silentlyExhausted) {
				resyncedAfterSilence = true;
				logger.warn("Eve stream produced nothing; resyncing cursor", {
					event: "leaf.eve_stream_silent_resync",
					data: {
						session_id: session.sessionId,
						stream_index: session.state.streamIndex,
					},
				});
				await resyncEveStreamIndex({ auth, session });
				// Persisted right away: a turn that later throws would otherwise leave
				// the drifted cursor in the row and repeat this cycle next message.
				await saveEveSessionState({ orgId, session });
				idleRetries = 0;
				continue;
			}
			await new Promise((resolve) =>
				setTimeout(resolve, STREAM_RETRY_DELAY_MS),
			);
		}
	} finally {
		abortController.abort();
	}

	// The retry budget ran out before any terminal event: keep whatever the
	// model managed to say, otherwise report how empty the turn really was.
	if (progress.pendingText) progress.finalText = progress.pendingText;
	if (eveTurnProducedOutput({ text: progress.finalText })) {
		closeReasoningStream({ onReasoning, progress });
		await saveEveSessionState({ orgId, session, state: { status: "waiting" } });
		return { kind: "answered", text: progress.finalText };
	}
	return streamedAnyEvent ? { kind: "silent" } : { kind: "unreachable" };
};
