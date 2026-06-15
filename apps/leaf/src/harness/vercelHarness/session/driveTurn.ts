import type {
	HarnessAgent,
	HarnessAgentContinueTurnState,
	HarnessAgentResumeSessionState,
	HarnessAgentSession,
} from "@ai-sdk/harness/agent";
import type { Span } from "braintrust";
import type { PreviewCapture } from "../../../agent/tools/toolPolicy.js";
import { normalizeToolName } from "../../../agent/tools/toolPolicy.js";
import { buildPreviewNudgeText } from "../../common/previewNudge.js";
import type {
	SessionTurnOutcome,
	SessionTurnUsage,
	SuspendedToolCall,
} from "../../common/types.js";
import { vercelHarnessConfig } from "../config.js";
import { consumeHarnessStream } from "./streamConsumer.js";

const mergeUsage = (
	a: SessionTurnUsage,
	b: SessionTurnUsage,
): SessionTurnUsage => ({
	cacheCreationInputTokens:
		a.cacheCreationInputTokens + b.cacheCreationInputTokens,
	cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
	inputTokens: a.inputTokens + b.inputTokens,
	outputTokens: a.outputTokens + b.outputTokens,
});

/** Persisted resume payload: a completed-turn resume state or a suspended-turn
 * continuation, tagged so the engine knows which createSession path to take. */
export type PersistedHarnessState =
	| { kind: "continue"; state: HarnessAgentContinueTurnState }
	| { kind: "resume"; state: HarnessAgentResumeSessionState };

const stripMcpPrefix = (name: string) =>
	name.replace(
		new RegExp(`^mcp__${vercelHarnessConfig.autumnMcpServerName}__`),
		"",
	);

const asObject = (value: unknown): Record<string, unknown> | undefined => {
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value);
			return parsed && typeof parsed === "object"
				? (parsed as Record<string, unknown>)
				: undefined;
		} catch {
			return undefined;
		}
	}
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: undefined;
};

// The approval's tool args carry the `{ request, intent }` envelope, with the
// bridge often stringifying `request`. The approval card + payload modal want
// the bare Autumn request OBJECT, so unwrap (and parse) it here.
const unwrapRequest = (input: unknown): Record<string, unknown> => {
	const envelope = asObject(input) ?? {};
	return asObject(envelope.request) ?? envelope;
};

export const driveVercelTurn = async ({
	abortSignal,
	agent,
	onAutumnTool,
	onTurnEnd,
	persist,
	previewCapture,
	prompt,
	session,
	span,
}: {
	abortSignal?: AbortSignal;
	agent: HarnessAgent;
	onAutumnTool?: (name: string) => Promise<void> | void;
	onTurnEnd?: (turn: SessionTurnOutcome) => Promise<"continue" | "stop">;
	persist: (state: PersistedHarnessState) => Promise<void>;
	previewCapture: PreviewCapture;
	prompt: string;
	session: HarnessAgentSession;
	span?: Span;
}): Promise<SessionTurnOutcome> => {
	const runStream = (turnPrompt: string) =>
		agent
			.stream({ abortSignal, prompt: turnPrompt, session })
			.then((result) =>
				consumeHarnessStream({ onAutumnTool, previewCapture, result, span }),
			);

	let turn = await runStream(prompt);
	const outcome: SessionTurnOutcome = {
		errorMessage: turn.errorMessage,
		textParts: [...turn.textParts],
		toolResults: [...turn.toolResults],
		usage: turn.usage,
	};

	// Preview-only turn: the model summarized a preview but never called the
	// write tool, so nothing suspended. Nudge it to call the write tool now so
	// the harness suspends and we surface an approval card (mirrors claude-managed).
	const captured = previewCapture.captured;
	if (
		turn.approvals.length === 0 &&
		captured &&
		!turn.errorMessage &&
		!abortSignal?.aborted
	) {
		const nudge = await runStream(
			buildPreviewNudgeText({ toolName: captured.toolName }),
		);
		outcome.errorMessage = nudge.errorMessage ?? outcome.errorMessage;
		outcome.textParts.push(...nudge.textParts);
		outcome.toolResults?.push(...nudge.toolResults);
		outcome.usage = mergeUsage(outcome.usage, nudge.usage);
		turn = nudge;
	}

	if (turn.approvals.length > 0) {
		const continueState = await session.suspendTurn();
		await persist({ kind: "continue", state: continueState });
		const pending = continueState.pendingToolApprovals ?? [];
		const queue: SuspendedToolCall[] = (
			pending.length ? pending : turn.approvals
		).map((approval) => ({
			args: unwrapRequest((approval as { input?: unknown }).input),
			toolCallId: approval.toolCallId,
			toolName: normalizeToolName(
				stripMcpPrefix(
					("nativeName" in approval && approval.nativeName) ||
						approval.toolName,
				),
			),
		}));
		outcome.suspendedQueue = queue;
		return outcome;
	}

	// Turn completed — detach (not stop) so the sandbox stays warm until its idle
	// timeout; rapid follow-ups reattach without a resume-boot.
	const resumeState = await session.detach();
	await persist({ kind: "resume", state: resumeState });
	await onTurnEnd?.(outcome);
	return outcome;
};
