import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import type { ActiveRun } from "../../../../runs/runRegistry.js";
import { AGENT_UNREACHABLE_MESSAGE } from "../../../../../ui/messages.js";
import {
	applyEveEvent,
	closeReasoningStream,
	type EveEventContext,
	eveTurnProducedOutput,
	type EveTurnOutcome,
} from "./applyEveEvent.js";
import {
	EveStreamDisconnectedError,
	EveStreamIdleTimeoutError,
	resyncEveStreamIndex,
	streamEveEvents,
} from "../../../eve/client.js";
import { saveEveSessionState } from "../../../eve/sessionState.js";
import type { EveAuthContext, EveSessionRef } from "../../../eve/types.js";

// Eve can close empty while asynchronously resuming a turn.
const MAX_IDLE_RETRIES = 20;
const STREAM_RETRY_DELAY_MS = 500;
const MAX_STREAM_DISCONNECT_RETRIES = 5;
const PERSIST_CURSOR_EVERY_EVENTS = 10;

type EveTurnContext = Omit<EveEventContext, "event"> & { auth: EveAuthContext };

// Preserve events yielded before a stream error.
type EveStreamPass = {
	error?: unknown;
	outcome?: EveTurnOutcome;
	sawEvent: boolean;
};

const streamPassEvents = async ({
	abandonForStop,
	run,
	signal,
	turn,
}: {
	abandonForStop: (
		stop: NonNullable<ActiveRun["stop"]>,
	) => Promise<EveTurnOutcome>;
	run?: ActiveRun;
	signal: AbortSignal;
	turn: EveTurnContext;
}): Promise<EveStreamPass> => {
	const { auth, orgId, session } = turn;
	let sawEvent = false;
	try {
		for await (const event of streamEveEvents({ auth, session, signal })) {
			sawEvent = true;
			session.state.streamIndex += 1;
			session.state.lastEventAt = Date.now();

			if (run?.stop)
				return { outcome: await abandonForStop(run.stop), sawEvent };

			const outcome = await applyEveEvent({ ...turn, event });
			if (outcome) return { outcome, sawEvent };

			if (session.state.streamIndex % PERSIST_CURSOR_EVERY_EVENTS === 0) {
				await saveEveSessionState({ orgId, session });
			}
		}
	} catch (error) {
		return { error, sawEvent };
	}
	return { sawEvent };
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
	closeReasoningStream({ onReasoning, progress });
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
	if (progress.pendingText) progress.finalText = progress.pendingText;
	if (!eveTurnProducedOutput({ text: progress.finalText })) {
		return streamedAnyEvent ? { kind: "silent" } : { kind: "unreachable" };
	}
	closeReasoningStream({ onReasoning, progress });
	await saveEveSessionState({ orgId, session, state: { status: "waiting" } });
	return { kind: "answered", text: progress.finalText };
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
	const turn: EveTurnContext = {
		auth,
		env,
		onAction,
		onReasoning,
		onThinking,
		orgId,
		progress: {
			finalText: "",
			pendingText: "",
			toolInputs: new Map(),
			toolLabels: new Map(),
			turnStarted: false,
		},
		session,
		token,
	};

	const abandonForStop = async (
		stop: NonNullable<ActiveRun["stop"]>,
	): Promise<EveTurnOutcome> => {
		abortController.abort();
		await saveEveSessionState({ orgId, session, state: { status: "waiting" } });
		return {
			kind: "stopped",
			stopReason: stop.reason,
			text: turn.progress.finalText,
		};
	};

	let streamedAnyEvent = false;
	let healedSilentCursor = false;
	let idleRetries = 0;
	let disconnectRetries = 0;

	try {
		while (idleRetries < MAX_IDLE_RETRIES) {
			// Eve cannot be interrupted server-side.
			if (run?.stop) return await abandonForStop(run.stop);

			const pass = await streamPassEvents({
				abandonForStop,
				run,
				signal: abortController.signal,
				turn,
			});
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
