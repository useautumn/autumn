import type { Span } from "braintrust";
import type {
	MessageContext,
	MessageParams,
} from "../../agent/runMessage/types.js";
import type {
	PreviewApproval,
	PreviewCapture,
} from "../../agent/tools/toolPolicy.js";
import { createPreviewCapture } from "../../agent/tools/toolPolicy.js";
import type { AgentOutput } from "../../types.js";
import { runHarnessTurnWithBraintrust } from "./braintrust.js";
import { redactAgentOutput } from "./output.js";
import type { SessionTurnOutcome } from "./types.js";

/** Drives one engine turn through the shared pump gate, deadline watchdog, and
 * output assembly. Engines supply only the harness-specific `runTurn` + `interrupt`. */
export const runEngineLoop = async ({
	braintrust,
	ctx,
	interrupt,
	newSession,
	params,
	previewCapture: providedPreviewCapture,
	runTurn,
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
	/** Shared capture when the engine wires it into host tools; else the loop owns one. */
	previewCapture?: PreviewCapture;
	/** Run a single turn to completion, wiring the shared pump + cancel + preview capture. */
	runTurn: (input: {
		isCancelled: () => boolean;
		onTurnEnd: (turn: SessionTurnOutcome) => Promise<"continue" | "stop">;
		previewCapture: PreviewCapture;
		span?: Span;
	}) => Promise<SessionTurnOutcome>;
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

	const previewCapture = providedPreviewCapture ?? createPreviewCapture();
	let timedOut = false;
	const isCancelled = () => timedOut || Boolean(run?.stop);

	// Pump gate: keep consuming while injected follow-ups are pending, posting
	// each drained turn's text as its own reply.
	const onTurnEnd = async (turn: SessionTurnOutcome) => {
		if (!isCancelled() && run && run.pendingTurns > 0) {
			run.pendingTurns -= 1;
			previewCapture.reset();
			const turnText = redactAgentOutput({
				logger,
				text: turn.textParts.join("\n\n"),
			});
			if (turnText.trim()) await onTurnComplete?.(turnText);
			return "continue" as const;
		}
		if (run) run.closed = true;
		return "stop" as const;
	};

	const drive = ({ span }: { span?: Span }) =>
		runTurn({ isCancelled, onTurnEnd, previewCapture, span });

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
	}

	const finalText = redactAgentOutput({
		logger,
		text: outcome.textParts.join("\n\n"),
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
		previewApproval: previewCapture.captured as PreviewApproval | undefined,
		runId: sessionId,
		suspendPayload: suspended
			? {
					args: suspended.args,
					toolCallId: suspended.toolCallId,
					toolName: suspended.toolName,
				}
			: undefined,
		text: finalText,
	};
};
