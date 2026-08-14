import type { AppEnv, CatalogPlanPreview } from "@autumn/shared";
import {
	isSilentTool,
	normalizeToolName,
} from "../../../agent/tools/toolPolicy.js";
import { toolRequestFromArgs } from "../../approvals/utils/toolRequest.js";
import { executeAutumnMcpTool } from "../../autumnMcp/client.js";
import type { RunStopReason } from "../../runs/runRegistry.js";
import type { Suspension } from "../../../types.js";
import { WAITING_FOR_INPUT_MESSAGE } from "../../../ui/messages.js";
import { parsePreviewPayload } from "../../../ui/previewContent.js";
import {
	catalogPlanNeedingDecision,
	enrichCatalogPreview,
} from "./catalogDecision.js";
import {
	type ChainedPendingRequest,
	classifyParkedEveInput,
	type PendingQuestion,
} from "./classifyParkedInput.js";
import type { EveEvent } from "./eveEventSchemas.js";
import {
	approvalOptionIds,
	displayEveToolLabel,
	isPreviewToolName,
	labelForResult,
	textForInputRequests,
} from "./events.js";
import {
	type CapturedPreview,
	previewForParkedWrite,
} from "./parkedWritePreview.js";
import { saveEveSessionState } from "./sessionState.js";
import type { EveSessionRef } from "./types.js";

/** How a turn ended. Every terminal shape is a `kind` so the caller decides
 * once, instead of the stream loop returning from six places. */
export type EveTurnOutcome =
	| { kind: "answered"; catalogDecision?: CatalogPlanPreview; text: string }
	| { kind: "parked"; question?: PendingQuestion; text: string }
	| { kind: "silent" }
	| { kind: "stopped"; stopReason: RunStopReason; text: string }
	| { kind: "suspended"; suspension: Suspension; text: string }
	| { kind: "unreachable" };

/** Whether a finished turn left the user anything. Eve can end a turn cleanly
 * while parked, so a caller that trusts "ended" alone wedges the thread. */
export const eveTurnProducedOutput = ({
	catalogDecision,
	text,
}: {
	catalogDecision?: unknown;
	text?: string;
}) => Boolean(text?.trim() || catalogDecision);

/** What the turn has accumulated so far, mutated as events arrive. */
export type EveTurnProgress = {
	finalText: string;
	lastPreview?: CapturedPreview;
	pendingText: string;
	reasoningStreamId?: string;
	toolInputs: Map<string, Record<string, unknown>>;
	toolLabels: Map<string, string>;
	/** The previous turn's tail (turn.completed, session.waiting) lands after
	 * input.requested and so replays first — terminal events only count once
	 * this turn's own turn.started has arrived. */
	turnStarted: boolean;
};

type EveEventType = EveEvent["type"];
type EveEventOf<T extends EveEventType> = Extract<EveEvent, { type: T }>;

export type EveEventContext<T extends EveEventType = EveEventType> = {
	env: AppEnv;
	event: EveEventOf<T>;
	onAction?: (message: string) => Promise<void> | void;
	onReasoning?: (input: { id: string; text: string }) => void;
	onThinking?: () => void;
	orgId: string;
	progress: EveTurnProgress;
	session: EveSessionRef;
	token: string;
};

const announceRequestedActions = async ({
	event,
	onAction,
	progress,
}: EveEventContext<"actions.requested">) => {
	const actions = event.actions;
	for (const action of actions) {
		const label = displayEveToolLabel(action);
		// Utility tools (date converters) aren't worth a status blip.
		const silent = action.toolName && isSilentTool(action.toolName);
		if (progress.turnStarted && !silent) await onAction?.(label);
		if (!action.callId) continue;
		progress.toolLabels.set(action.callId, label);
		if (action.input) progress.toolInputs.set(action.callId, action.input);
	}
};

const capturePreviewResult = async ({
	env,
	input,
	output,
	toolName,
	token,
}: {
	env: AppEnv;
	input?: Record<string, unknown>;
	output: unknown;
	toolName: string;
	token: string;
}): Promise<CapturedPreview> => ({
	// Enriched (variant/version flags forced) so the approval card and the
	// suspension decision gate both see the full preview.
	preview: await enrichCatalogPreview({
		executeTool: (call) => executeAutumnMcpTool({ env, token, ...call }),
		input,
		preview: parsePreviewPayload(output) ?? output,
	}),
	previewTool: normalizeToolName(toolName),
	request: toolRequestFromArgs(input),
});

const absorbActionResult = async ({
	env,
	event,
	onAction,
	progress,
	token,
}: EveEventContext<"action.result">) => {
	const result = event.result;
	if (result?.toolName && isPreviewToolName(result.toolName)) {
		const input = result.callId
			? progress.toolInputs.get(result.callId)
			: undefined;
		// A failed preview leaves nothing to show, so it must also retire the one
		// before it — the write is about to be previewed, not re-described.
		progress.lastPreview =
			event.status === "completed"
				? await capturePreviewResult({
						env,
						input,
						output: result.output,
						toolName: result.toolName,
						token,
					})
				: undefined;
	}
	if (!result?.callId) return;
	// actions.requested already surfaced this tool as a step; announcing it here
	// too would render every call twice.
	if (progress.turnStarted && !progress.toolLabels.has(result.callId)) {
		await onAction?.(displayEveToolLabel(labelForResult(result)));
	}
	progress.toolLabels.delete(result.callId);
};

const appendMessageDelta = ({
	event,
	onReasoning,
	progress,
}: EveEventContext<"message.appended">) => {
	const messageSoFar = event.messageSoFar;
	progress.pendingText =
		typeof messageSoFar === "string"
			? messageSoFar
			: `${progress.pendingText}${event.messageDelta}`;
	progress.reasoningStreamId ??= crypto.randomUUID();
	onReasoning?.({ id: progress.reasoningStreamId, text: progress.pendingText });
};

/** Blanks the open reasoning stream so the text about to be posted as the reply
 * isn't also left rendered as live thinking. */
export const closeReasoningStream = ({
	onReasoning,
	progress,
}: {
	onReasoning?: EveEventContext["onReasoning"];
	progress: EveTurnProgress;
}) => {
	if (progress.reasoningStreamId) {
		onReasoning?.({ id: progress.reasoningStreamId, text: "" });
	}
	progress.reasoningStreamId = undefined;
};

const completeMessage = ({
	event,
	onReasoning,
	progress,
}: EveEventContext<"message.completed">) => {
	const message = event.message || progress.pendingText;
	progress.pendingText = "";
	if (event.finishReason === "tool-calls") {
		// Reasoning that preceded a tool call stays on screen as a step.
		progress.reasoningStreamId ??= crypto.randomUUID();
		onReasoning?.({ id: progress.reasoningStreamId, text: message });
		progress.reasoningStreamId = undefined;
		return;
	}
	closeReasoningStream({ onReasoning, progress });
	progress.finalText = message;
};

/** The approval card's payload: the write's own args plus the option ids the
 * resume path answers eve with, and the preview if this turn took one. */
const suspensionForGatedWrite = ({
	chained,
	progress,
	siblingRequestIds,
}: {
	chained: ChainedPendingRequest;
	progress: EveTurnProgress;
	siblingRequestIds: string[];
}): Suspension => {
	const options = approvalOptionIds({ options: chained.options });
	return {
		toolCallId: chained.requestId,
		toolName: chained.toolName,
		toolArgs: {
			...(chained.input ?? {}),
			_eveApproveOptionId: options.approve,
			_eveDenyOptionId: options.deny,
			_eveSiblingRequestIds: siblingRequestIds,
		},
		preview: previewForParkedWrite({
			captured: progress.lastPreview,
			input: chained.input,
			toolName: chained.toolName,
		}),
	};
};

const parkOnInputRequest = async ({
	event,
	orgId,
	progress,
	session,
}: EveEventContext<"input.requested">): Promise<EveTurnOutcome> => {
	const requests = event.requests;
	const parked = classifyParkedEveInput({ requests });
	await saveEveSessionState({ orgId, session, state: { status: "waiting" } });

	if (parked?.kind === "gated") {
		return {
			kind: "suspended",
			suspension: suspensionForGatedWrite({
				chained: parked.chained,
				progress,
				siblingRequestIds: parked.siblingRequestIds,
			}),
			text: progress.finalText,
		};
	}

	// Whatever the model said before parking beats the generic waiting line,
	// which only fills in for a silent turn.
	if (progress.pendingText) progress.finalText = progress.pendingText;
	if (!eveTurnProducedOutput({ text: progress.finalText })) {
		progress.finalText =
			textForInputRequests(requests) || WAITING_FOR_INPUT_MESSAGE;
	}
	// An optioned question also rides structurally so rich surfaces can render
	// answer buttons; `text` keeps the flat fallback.
	return {
		kind: "parked",
		question: parked?.kind === "question" ? parked.question : undefined,
		text: progress.finalText,
	};
};

const finishOnTerminalEvent = async ({
	event,
	orgId,
	progress,
	session,
}: EveEventContext): Promise<EveTurnOutcome> => {
	if (progress.pendingText) progress.finalText = progress.pendingText;
	await saveEveSessionState({
		orgId,
		session,
		state: {
			status: event.type === "session.completed" ? "completed" : "waiting",
		},
	});
	// The model may (correctly) stop after a preview that needs versioning/
	// variant/migration choices — surface that decision now the turn is over.
	const catalogDecision = catalogPlanNeedingDecision(
		progress.lastPreview?.preview,
	);
	if (eveTurnProducedOutput({ catalogDecision, text: progress.finalText })) {
		return { kind: "answered", catalogDecision, text: progress.finalText };
	}
	return { kind: "silent" };
};

/**
 * Folds one streamed event into the turn's progress. Returns an outcome only
 * when that event ended the turn; `undefined` means keep streaming.
 */
export const applyEveEvent = async (
	context: EveEventContext,
): Promise<EveTurnOutcome | undefined> => {
	const { event, onThinking, orgId, progress, session } = context;
	switch (event.type) {
		case "turn.started":
			progress.turnStarted = true;
			// A follow-up turn must not inherit the prior turn's preview, or a
			// preview-less turn ends on a stale catalog decision.
			progress.lastPreview = undefined;
			return undefined;

		case "step.started":
			if (progress.turnStarted) onThinking?.();
			return undefined;

		case "actions.requested":
			await announceRequestedActions({ ...context, event });
			return undefined;

		case "action.result":
			await absorbActionResult({ ...context, event });
			return undefined;

		case "message.appended":
			if (progress.turnStarted) appendMessageDelta({ ...context, event });
			return undefined;

		case "message.completed":
			if (progress.turnStarted) completeMessage({ ...context, event });
			return undefined;

		case "input.requested":
			if (!progress.turnStarted) return undefined;
			return await parkOnInputRequest({ ...context, event });

		case "turn.failed":
		case "session.failed":
			if (!progress.turnStarted) return undefined;
			await saveEveSessionState({
				orgId,
				session,
				state: { status: "failed" },
			});
			throw new Error(event.message);

		case "session.waiting":
		case "session.completed":
			if (!progress.turnStarted) return undefined;
			return await finishOnTerminalEvent(context);

		default:
			return undefined;
	}
};
