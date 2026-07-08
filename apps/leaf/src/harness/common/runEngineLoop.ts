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
 * output assembly. */
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
		onTurnStarted: () => void;
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

	let turnInterruptible = false;
	let followUpInterrupt: Promise<void> | undefined;
	const requestFollowUpInterrupt = () => {
		if (
			!run ||
			!turnInterruptible ||
			followUpInterrupt !== undefined ||
			isCancelled() ||
			run.followUps.size === 0
		) {
			return;
		}
		turnInterruptible = false;
		followUpInterrupt = Promise.resolve(interrupt()).catch((error) => {
			logger.warn("Could not interrupt session for follow-up", {
				event: "leaf.run_follow_up_interrupt_failed",
				context: { env, org_id: org.id },
				data: { session_id: sessionId },
				error,
			});
		});
	};
	if (run) run.followUps.onPush = requestFollowUpInterrupt;

	const onTurnStarted = () => {
		turnInterruptible = true;
		requestFollowUpInterrupt();
	};

	const onTurnEnd = async (turn: SessionTurnOutcome) => {
		turnInterruptible = false;
		const interruptBeforeFlush = followUpInterrupt;
		followUpInterrupt = undefined;
		if (!run || isCancelled() || run.followUps.size === 0) {
			run?.followUps.close();
			return "stop" as const;
		}
		const rawTurnText = turn.textParts.join("\n\n");
		assertPostableText(rawTurnText);
		const turnText = redactAgentOutput({
			logger,
			text: rawTurnText,
		});
		if (turnText.trim()) await onTurnComplete?.(turnText);
		// A racing follow-up interrupt must land before the queued user message, or it could cancel that message.
		await interruptBeforeFlush;
		// Drain after the post succeeds so a failed turn keeps the queue; restore on a failed send.
		const singleTurnBatch = run.followUps.drain();
		try {
			await sendFollowUp({ text: singleTurnBatch.join("\n\n") });
		} catch (error) {
			run.followUps.restore(singleTurnBatch);
			throw error;
		}
		return "continue" as const;
	};

	const drive = ({ span }: { span?: Span }) =>
		runTurn({ isCancelled, onTurnEnd, onTurnStarted, span });

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
		// Close on every exit (incl. suspension) so late injects start a new run.
		turnInterruptible = false;
		if (run) {
			run.followUps.close();
			run.followUps.onPush = undefined;
		}
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
