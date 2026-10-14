import type { AutumnLogger } from "@autumn/logging";
import { type AppEnv, ms } from "@autumn/shared";
import { AGENT_UNREACHABLE_MESSAGE } from "../../../../../ui/messages.js";
import type { ActiveRun } from "../../../../runs/runRegistry.js";
import {
	EveSessionDeadError,
	EveStreamDisconnectedError,
	EveStreamIdleTimeoutError,
	streamEveEvents,
} from "../../../eve/client.js";
import {
	advanceStreamCursor,
	saveEveSessionState,
} from "../../../eve/sessionState.js";
import type { EveAuthContext, EveSessionRef } from "../../../eve/types.js";
import {
	MAX_IDLE_RESYNCS,
	MAX_IDLE_RETRIES,
	MAX_QUIET_MS,
	MAX_TURN_DURATION_MS,
	STREAM_IDLE_TIMEOUT_MS,
	STREAM_RETRY_DELAY_MS,
} from "../../../turnBudget.js";
import { applyEveEvent, type EveEventContext } from "./applyEveEvent.js";
import {
	createEveTurnProgress,
	type EveTurnOutcome,
	type EveTurnProgress,
	eveTurnProducedOutput,
} from "./eveTurnReducer.js";
import { createTurnActivity, type TurnActivity } from "./turnActivity.js";
import { watchSubagentProgress } from "./watchSubagentProgress.js";

const PERSIST_CURSOR_EVERY_EVENTS = 10;

const MIN_IDLE_WINDOW_MS = ms.seconds(1);

const idleWindowFor = ({
	activity,
	deadlineAt,
}: {
	activity: TurnActivity;
	deadlineAt?: number;
}) => {
	if (deadlineAt === undefined || activity.activeChildren() > 0) {
		return STREAM_IDLE_TIMEOUT_MS;
	}
	return Math.max(
		MIN_IDLE_WINDOW_MS,
		Math.min(STREAM_IDLE_TIMEOUT_MS, deadlineAt - Date.now()),
	);
};

const FOLLOW_UP_POST_SETTLE_MS = ms.seconds(5);

const settleFollowUpPosts = async (run?: ActiveRun) => {
	const deadline = Date.now() + FOLLOW_UP_POST_SETTLE_MS;
	let inFlight = run?.followUpPostsInFlight();
	while (inFlight) {
		const remaining = deadline - Date.now();
		if (remaining <= 0) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		await Promise.race([
			inFlight,
			new Promise<void>((resolve) => {
				timer = setTimeout(resolve, remaining);
			}),
		]);
		if (timer) clearTimeout(timer);
		inFlight = run?.followUpPostsInFlight();
	}
};

type EveTurnContext = Omit<EveEventContext, "event"> & { auth: EveAuthContext };

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
	activity,
	emitSettledTurn,
	idleTimeoutMs,
	onFirstStreamEvent,
	run,
	signal,
	turn,
}: {
	activity: TurnActivity;
	abandonForStop: (input: {
		progress: EveTurnProgress;
		stop: NonNullable<ActiveRun["stop"]>;
	}) => Promise<EveTurnOutcome>;
	emitSettledTurn: (outcome: EveTurnOutcome) => Promise<void>;
	idleTimeoutMs: () => number;
	onFirstStreamEvent?: () => void;
	run?: ActiveRun;
	signal: AbortSignal;
	turn: EveTurnContext;
}): Promise<EveStreamPass> => {
	const { auth, orgId, session } = turn;
	let progress = turn.progress;
	let sawEvent = false;
	try {
		for await (const event of streamEveEvents({
			auth,
			idleTimeoutMs,
			session,
			signal,
		})) {
			if (!sawEvent) onFirstStreamEvent?.();
			sawEvent = true;
			activity.touch();
			advanceStreamCursor(session);

			if (run?.stop) {
				return {
					outcome: await abandonForStop({ progress, stop: run.stop }),
					progress,
					sawEvent,
				};
			}

			if (event.type === "turn.cancelled") run?.noteTurnCancelled();
			if (event.type === "turn.started") run?.coverAcceptedFollowUps();

			const result = await applyEveEvent({ ...turn, event, progress });
			progress = result.progress;
			if (result.outcome) {
				await saveEveSessionState({ orgId, session });
				await settleFollowUpPosts(run);
				if (run?.claimFollowUpsOrSettle()) {
					await emitSettledTurn(result.outcome);
					progress = createEveTurnProgress();
					continue;
				}
				return { outcome: result.outcome, progress, sawEvent };
			}

			if (event.type === "subagent.called" && event.childSessionId) {
				activity.childStarted();
				watchSubagentProgress({
					auth,
					childSessionId: event.childSessionId,
					onAction: turn.onAction,
					onChildActivity: activity.touch,
					onChildEnded: activity.childFinished,
					onReasoning: turn.onReasoning,
					session,
					signal,
				});
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

const persistCursorAfterIdleStream = async ({
	attempt,
	logger,
	turn,
}: {
	attempt: number;
	logger: AutumnLogger;
	turn: EveTurnContext;
}) => {
	const { orgId, session } = turn;
	logger.warn("Eve stream went idle; reopening at the cursor", {
		event: "leaf.eve_stream_idle_timeout",
		data: {
			attempt,
			session_id: session.sessionId,
			stream_index: session.state.streamIndex,
		},
	});
	await saveEveSessionState({ orgId, session });
};

const settleExhaustedTurn = ({
	activity,
	emittedSettledTurn,
	logger,
	turn,
}: {
	activity: TurnActivity;
	emittedSettledTurn: boolean;
	logger: AutumnLogger;
	turn: EveTurnContext;
}): EveTurnOutcome => {
	const { onReasoning, progress, session } = turn;
	const partialText = progress.finalText || progress.pendingText;
	logger.error("Eve never resumed the turn", {
		event: "leaf.eve_turn_abandoned",
		data: {
			awaited_follow_up: emittedSettledTurn,
			has_partial_text: Boolean(partialText),
			quiet_ms: activity.msSinceActivity(),
			session_id: session.sessionId,
			stream_index: session.state.streamIndex,
			turn_ms: activity.msSinceStart(),
		},
	});
	if (emittedSettledTurn && !partialText)
		return { declined: true, kind: "silent" };
	if (!partialText) throw new Error(AGENT_UNREACHABLE_MESSAGE);
	closeReasoningOutput({ onReasoning, progress });
	return { kind: "answered", text: partialText };
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
	await saveEveSessionState({ orgId, session });
	return { kind: "answered", text: finalText };
};

export const consumeAgentTurn = async ({
	auth,
	deadlineAt,
	env,
	logger,
	onAction,
	onFirstStreamEvent,
	onReasoning,
	onSettledTurn,
	onThinking,
	orgId,
	run,
	session,
	token,
}: {
	auth: EveAuthContext;
	deadlineAt?: number;
	env: AppEnv;
	logger: AutumnLogger;
	onAction?: EveEventContext["onAction"];
	onFirstStreamEvent?: () => void;
	onReasoning?: EveEventContext["onReasoning"];
	onSettledTurn?: (outcome: EveTurnOutcome) => Promise<void> | void;
	onThinking?: EveEventContext["onThinking"];
	orgId: string;
	run?: ActiveRun;
	session: EveSessionRef;
	token: string;
}): Promise<EveTurnOutcome> => {
	const abortController = new AbortController();
	let emittedSettledTurn = false;
	const emitSettledTurn = async (outcome: EveTurnOutcome) => {
		emittedSettledTurn = true;
		logger.info("Turn settled with a follow-up still to read", {
			event: "leaf.eve_follow_up_turn_awaited",
			data: {
				outcome_kind: outcome.kind,
				session_id: session.sessionId,
				stream_index: session.state.streamIndex,
			},
		});
		await onSettledTurn?.(outcome);
	};
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
		await saveEveSessionState({ orgId, session });
		return {
			kind: "stopped",
			stopReason: stop.reason,
			text: progress.finalText,
		};
	};

	let streamedAnyEvent = false;
	let idleRetries = 0;
	const activity = createTurnActivity();

	const abortForRunStop = () => abortController.abort();
	if (run) run.abortTurnStream = abortForRunStop;

	try {
		while (idleRetries < MAX_IDLE_RETRIES) {
			if (run?.stop) {
				return await abandonForStop({
					progress: turn.progress,
					stop: run.stop,
				});
			}

			const childIsWorking = activity.activeChildren() > 0;
			const quietTooLong = activity.msSinceActivity() >= MAX_QUIET_MS;
			const deadlineReached =
				deadlineAt !== undefined && Date.now() >= deadlineAt;
			if (
				activity.msSinceStart() >= MAX_TURN_DURATION_MS ||
				(!childIsWorking && (quietTooLong || deadlineReached))
			) {
				return settleExhaustedTurn({
					activity,
					emittedSettledTurn,
					logger,
					turn,
				});
			}

			const pass = await streamPassEvents({
				abandonForStop,
				activity,
				emitSettledTurn,
				idleTimeoutMs: () => idleWindowFor({ activity, deadlineAt }),
				onFirstStreamEvent: streamedAnyEvent ? undefined : onFirstStreamEvent,
				run,
				signal: abortController.signal,
				turn,
			});
			turn = { ...turn, progress: pass.progress };
			streamedAnyEvent ||= pass.sawEvent;
			if (pass.outcome) return pass.outcome;

			if (run?.stop) {
				return await abandonForStop({
					progress: turn.progress,
					stop: run.stop,
				});
			}

			if (pass.error instanceof EveStreamIdleTimeoutError) {
				const turnIsWorking = activity.activeChildren() > 0;
				idleRetries = pass.sawEvent || turnIsWorking ? 0 : idleRetries + 1;
				if (idleRetries >= MAX_IDLE_RESYNCS) {
					return settleExhaustedTurn({
						activity,
						emittedSettledTurn,
						logger,
						turn,
					});
				}
				await persistCursorAfterIdleStream({
					attempt: idleRetries,
					logger,
					turn,
				});
				continue;
			}
			if (
				pass.error instanceof EveStreamDisconnectedError &&
				!streamedAnyEvent
			) {
				logger.error("Eve session produced no events across every reconnect", {
					event: "leaf.eve_session_dead",
					data: {
						new_session: session.newSession,
						session_id: session.sessionId,
						stream_index: session.state.streamIndex,
					},
					error: pass.error,
				});
				throw new EveSessionDeadError(session.sessionId);
			}
			if (pass.error !== undefined) throw pass.error;

			idleRetries = pass.sawEvent ? 0 : idleRetries + 1;
			await new Promise((resolve) =>
				setTimeout(resolve, STREAM_RETRY_DELAY_MS),
			);
		}
	} finally {
		if (run?.abortTurnStream === abortForRunStop)
			run.abortTurnStream = undefined;
		abortController.abort();
	}

	return await outcomeForExhaustedRetries({ streamedAnyEvent, turn });
};
