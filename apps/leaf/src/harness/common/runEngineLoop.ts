import type { Span } from "braintrust";
import type {
	MessageContext,
	MessageParams,
} from "../../agent/runMessage/types.js";
import type { AgentOutput } from "../../types.js";
import { runHarnessTurnWithBraintrust } from "./braintrust.js";
import { containsInternalToolCall, redactAgentOutput } from "./output.js";
import type { SessionTurnOutcome } from "./types.js";

/** Drives one engine turn through the shared pump gate, deadline watchdog, and
 * output assembly. Engines supply only the harness-specific `runTurn` + `interrupt`. */
export const runEngineLoop = async ({
	braintrust,
	ctx,
	interrupt,
	newSession,
	params,
	runTurn,
	sendFollowUp,
	sessionId,
}: {
	braintrust?: {
		braintrustParent?: string;
		persistBraintrustParent: (parent: string) => Promise<void>;
		spanName: string;
	};
	ctx: MessageContext;
	/** Stop the in-flight turn server-side when the deadline fires. */
	interrupt: () => Promise<void> | void;
	newSession: boolean;
	params: MessageParams;
	/** Run a single turn to completion, wiring the shared pump + cancel. */
	runTurn: (input: {
		isCancelled: () => boolean;
		onTurnEnd: (turn: SessionTurnOutcome) => Promise<"continue" | "stop">;
		span?: Span;
	}) => Promise<SessionTurnOutcome>;
	/** Deliver queued follow-up text to the session as the next user message. */
	sendFollowUp: (input: { text: string }) => Promise<void>;
	sessionId: string;
}): Promise<AgentOutput> => {
	const {
		deadlineAt,
		env,
		logger,
		onAction,
		onTurnComplete,
		org,
		run,
		thread,
	} = ctx;

	logger.info("Starting agent", {
		event: "leaf.agent_started",
		context: { env, org_id: org.id, provider: thread.provider },
		data: {
			agent_run_id: ctx.id,
			resumed: !newSession,
			session_id: sessionId,
			thread_id: thread.threadId,
		},
	});

	let timedOut = false;
	const isCancelled = () => timedOut || Boolean(run?.stop);
	const assertPostableText = (text: string) => {
		if (!containsInternalToolCall(text)) return;
		logger.error("Blocked internal tool-call markup in agent output", {
			event: "leaf.agent_output_internal_tool_call_blocked",
			context: { env, org_id: org.id },
			data: { session_id: sessionId },
		});
		throw new Error(
			"Agent returned internal tool-call markup instead of a user response",
		);
	};

	// The pump is the session's only writer of user messages: follow-ups queue
	// locally on the run and are flushed here, at an idle the pump observed. A
	// flush into an idle session starts exactly one turn ending in exactly one
	// idle, so the pump can never wait on a turn the server won't run.
	let turnInFlight = false;
	if (run) {
		run.notifyFollowUpQueued = () => {
			// Interrupt only a live turn, so the queued text becomes the very next
			// turn (the user chose immediate pivot over queue-behind-the-turn). At
			// idle there is nothing to interrupt — the flush below delivers it.
			if (turnInFlight && !isCancelled()) {
				void Promise.resolve(interrupt()).catch(() => {});
			}
		};
	}

	const onTurnEnd = async (turn: SessionTurnOutcome) => {
		turnInFlight = false;
		// The drain and the empty-queue close stay synchronous so they are atomic
		// against injectFollowUp's closed-check-then-push on the same event loop.
		const queued = run && !isCancelled() ? run.drainFollowUps() : [];
		if (queued.length === 0) {
			if (run) run.closed = true;
			return "stop" as const;
		}
		const rawTurnText = turn.textParts.join("\n\n");
		assertPostableText(rawTurnText);
		const turnText = redactAgentOutput({
			logger,
			text: rawTurnText,
		});
		if (turnText.trim()) await onTurnComplete?.(turnText);
		// One message per flush: several queued texts become one turn, and the
		// pump expects exactly the one idle that turn ends with.
		await sendFollowUp({ text: queued.join("\n\n") });
		turnInFlight = true;
		return "continue" as const;
	};

	const drive = ({ span }: { span?: Span }) => {
		turnInFlight = true;
		return runTurn({ isCancelled, onTurnEnd, span });
	};

	const deadlineDelayMs = deadlineAt ? deadlineAt - Date.now() : 0;
	const deadlineWatchdog =
		deadlineDelayMs > 0
			? setTimeout(() => {
					timedOut = true;
					logger.warn("Interrupting agent run at deadline", {
						event: "leaf.agent_deadline_interrupt",
						context: { env, org_id: org.id },
						data: { session_id: sessionId },
					});
					void onAction?.("Taking too long — stopping the run…");
					void Promise.resolve(interrupt()).catch(() => {});
				}, deadlineDelayMs)
			: undefined;

	let outcome: SessionTurnOutcome;
	try {
		outcome = braintrust
			? await runHarnessTurnWithBraintrust({
					agentRunId: ctx.id,
					braintrustParent: braintrust.braintrustParent,
					env,
					newSession,
					orgId: org.id,
					params,
					persistBraintrustParent: braintrust.persistBraintrustParent,
					runTurn: drive,
					sessionId,
					spanName: braintrust.spanName,
					thread,
				})
			: await drive({});
	} finally {
		if (deadlineWatchdog) clearTimeout(deadlineWatchdog);
		// A late inject must not interrupt a suspended or finished session; its
		// queued text is surfaced as dropped when the run closes.
		if (run) run.notifyFollowUpQueued = undefined;
	}

	const rawFinalText = outcome.textParts.join("\n\n");
	assertPostableText(rawFinalText);
	const finalText = redactAgentOutput({
		logger,
		text: rawFinalText,
	});
	const stopped = isCancelled();
	const suspended = stopped ? undefined : outcome.suspendedQueue?.[0];
	if (outcome.errorMessage && !finalText && !suspended && !stopped) {
		throw new Error(`Agent failed: ${outcome.errorMessage}`);
	}

	const finishReason = stopped ? "stopped" : suspended ? "suspended" : "stop";
	logger.info("Completed agent", {
		event: "leaf.agent_completed",
		context: { env },
		data: {
			cost_tokens: outcome.usage.inputTokens + outcome.usage.outputTokens,
			finish_reason: finishReason,
			resumed: !newSession,
			run_id: sessionId,
		},
	});

	return {
		env,
		finishReason,
		stopReason: stopped ? (timedOut ? "timeout" : "user") : undefined,
		runId: sessionId,
		suspension: suspended
			? {
					preview: suspended.preview,
					toolArgs: suspended.args,
					toolCallId: suspended.toolCallId,
					toolName: suspended.toolName,
				}
			: undefined,
		text: finalText,
	};
};
