import type { AutumnLogger } from "@autumn/logging";
import { type AppEnv, ms } from "@autumn/shared";
import { AGENT_UNREACHABLE_MESSAGE } from "../../../../../ui/messages.js";
import type { ActiveRun } from "../../../../runs/runRegistry.js";
import {
	EveStreamDisconnectedError,
	EveStreamIdleTimeoutError,
	resyncEveStreamIndex,
	streamEveEvents,
} from "../../../eve/client.js";
import { saveEveSessionState } from "../../../eve/sessionState.js";
import type { EveAuthContext, EveSessionRef } from "../../../eve/types.js";
import { applyEveEvent, type EveEventContext } from "./applyEveEvent.js";
import {
	createEveTurnProgress,
	type EveTurnOutcome,
	type EveTurnProgress,
	eveTurnProducedOutput,
} from "./eveTurnReducer.js";

// Eve can close empty while asynchronously resuming a turn.
const MAX_IDLE_RETRIES = 20;
const STREAM_RETRY_DELAY_MS = ms.seconds(0.5);
const MAX_STREAM_DISCONNECT_RETRIES = 5;
const PERSIST_CURSOR_EVERY_EVENTS = 10;

type EveTurnContext = Omit<EveEventContext, "event"> & { auth: EveAuthContext };

// Preserve events yielded before a stream error.
type EveStreamPass = {
	error?: unknown;
	outcome?: EveTurnOutcome;
	progress: EveTurnProgress;
	sawEvent: boolean;
};

const closeReasoningOutput = ({
	onReasoning,
	progress,
}: {
	onReasoning?: EveEventContext["onReasoning"];
	progress: EveTurnProgress;
}) => {
	if (progress.reasoningStreamId) {
		onReasoning?.({ id: progress.reasoningStreamId, text: "" });
	}
};

const streamPassEvents = async ({
	abandonForStop,
	run,
	signal,
	turn,
}: {
	abandonForStop: (input: {
		progress: EveTurnProgress;
		stop: NonNullable<ActiveRun["stop"]>;
	}) => Promise<EveTurnOutcome>;
	run?: ActiveRun;
	signal: AbortSignal;
	turn: EveTurnContext;
}): Promise<EveStreamPass> => {
	const { auth, orgId, session } = turn;
	let progress = turn.progress;
	let sawEvent = false;
	try {
		for await (const event of streamEveEvents({ auth, session, signal })) {
			sawEvent = true;
			session.state.streamIndex += 1;
			session.state.lastEventAt = Date.now();

			if (run?.stop) {
				return {
					outcome: await abandonForStop({ progress, stop: run.stop }),
					progress,
					sawEvent,
				};
			}

			const result = await applyEveEvent({ ...turn, event, progress });
			progress = result.progress;
			if (result.outcome) {
				return { outcome: result.outcome, progress, sawEvent };
			}

			if (session.state.streamIndex % PERSIST_CURSOR_EVERY_EVENTS === 0) {
				await saveEveSessionState({ orgId, session });
			}
		}
	} catch (error) {
		return { error, progress, sawEvent };
	}
	return { progress, sawEvent };
};

const recoverFromIdleStream = async ({
	logger,
	turn,
}: {
	logger: AutumnLogger;
	turn: EveTurnContext;
}): Promise<EveTurnOutcome> => {
	const { auth, onReasoning, orgId, progress, session } = turn;
	logger.warn("Eve stream went idle; resyncing cursor", {
		event: "leaf.eve_stream_idle_timeout",
		data: {
			session_id: session.sessionId,
			stream_index: session.state.streamIndex,
		},
	});
	await resyncEveStreamIndex({ auth, session });
	await saveEveSessionState({ orgId, session, state: { status: "waiting" } });
	const partialText = progress.finalText || progress.pendingText;
	if (!partialText) throw new Error(AGENT_UNREACHABLE_MESSAGE);
	closeReasoningOutput({ onReasoning, progress });
	return { kind: "answered", text: partialText };
};

const healSilentCursor = async ({
	logger,
	turn,
}: {
	logger: AutumnLogger;
	turn: EveTurnContext;
}) => {
	const { auth, orgId, session } = turn;
	logger.warn("Eve stream produced nothing; resyncing cursor", {
		event: "leaf.eve_stream_silent_resync",
		data: {
			session_id: session.sessionId,
			stream_index: session.state.streamIndex,
		},
	});
	await resyncEveStreamIndex({ auth, session });
	await saveEveSessionState({ orgId, session });
};

const outcomeForExhaustedRetries = async ({
	streamedAnyEvent,
	turn,
}: {
	streamedAnyEvent: boolean;
	turn: EveTurnContext;
}): Promise<EveTurnOutcome> => {
	const { onReasoning, orgId, progress, session } = turn;
	const finalText = progress.pendingText || progress.finalText;
	if (!eveTurnProducedOutput({ text: finalText })) {
		return streamedAnyEvent ? { kind: "silent" } : { kind: "unreachable" };
	}
	closeReasoningOutput({ onReasoning, progress });
	await saveEveSessionState({ orgId, session, state: { status: "waiting" } });
	return { kind: "answered", text: finalText };
};

export const consumeAgentTurn = async ({
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
	let turn: EveTurnContext = {
		auth,
		env,
		onAction,
		onReasoning,
		onThinking,
		orgId,
		progress: createEveTurnProgress(),
		session,
		token,
	};

	const abandonForStop = async ({
		progress,
		stop,
	}: {
		progress: EveTurnProgress;
		stop: NonNullable<ActiveRun["stop"]>;
	}): Promise<EveTurnOutcome> => {
		abortController.abort();
		await saveEveSessionState({ orgId, session, state: { status: "waiting" } });
		return {
			kind: "stopped",
			stopReason: stop.reason,
			text: progress.finalText,
		};
	};

	let streamedAnyEvent = false;
	let healedSilentCursor = false;
	let idleRetries = 0;
	let disconnectRetries = 0;

	try {
		while (idleRetries < MAX_IDLE_RETRIES) {
			// Eve cannot be interrupted server-side.
			if (run?.stop) {
				return await abandonForStop({
					progress: turn.progress,
					stop: run.stop,
				});
			}

			const pass = await streamPassEvents({
				abandonForStop,
				run,
				signal: abortController.signal,
				turn,
			});
			turn = { ...turn, progress: pass.progress };
			streamedAnyEvent ||= pass.sawEvent;
			if (pass.outcome) return pass.outcome;

			if (pass.error instanceof EveStreamDisconnectedError) {
				disconnectRetries += 1;
				logger.warn("Eve stream disconnected; reconnecting", {
					event: "leaf.eve_stream_disconnected",
					data: {
						attempt: disconnectRetries,
						error: pass.error.message,
						session_id: session.sessionId,
						stream_index: session.state.streamIndex,
					},
				});
				if (disconnectRetries >= MAX_STREAM_DISCONNECT_RETRIES)
					throw pass.error;
				continue;
			}
			if (pass.error instanceof EveStreamIdleTimeoutError) {
				return await recoverFromIdleStream({ logger, turn });
			}
			if (pass.error !== undefined) throw pass.error;

			idleRetries = pass.sawEvent ? 0 : idleRetries + 1;
			const silentlyExhausted =
				idleRetries >= MAX_IDLE_RETRIES &&
				!(streamedAnyEvent || healedSilentCursor);
			if (silentlyExhausted) {
				healedSilentCursor = true;
				await healSilentCursor({ logger, turn });
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

	return await outcomeForExhaustedRetries({ streamedAnyEvent, turn });
};
