import type { AppEnv, CatalogPlanPreview } from "@autumn/shared";
import {
	isSilentTool,
	normalizeToolName,
} from "../../../../../agent/tools/toolPolicy.js";
import type { AgentApprovalRequest } from "../../../domain/agentTurn.js";
import { toolRequestFromArgs } from "../../../../approvals/utils/toolRequest.js";
import { executeAutumnMcpTool } from "../../../../autumnMcp/client.js";
import type { RunStopReason } from "../../../../runs/runRegistry.js";
import { WAITING_FOR_INPUT_MESSAGE } from "../../../../../ui/messages.js";
import { parsePreviewPayload } from "../../../../../ui/previewContent.js";
import {
	catalogPlanNeedingDecision,
	enrichCatalogPreview,
} from "../../../eve/catalogDecision.js";
import {
	type ChainedPendingRequest,
	classifyParkedEveInput,
	type PendingQuestion,
} from "../../../eve/classifyParkedInput.js";
import type { EveEvent } from "../../../eve/eveEventSchemas.js";
import {
	approvalOptionIds,
	displayEveToolLabel,
	isPreviewToolName,
	labelForResult,
	textForInputRequests,
} from "../../../eve/events.js";
import {
	type CapturedPreview,
	previewForParkedWrite,
} from "../../../eve/parkedWritePreview.js";
import { saveEveSessionState } from "../../../eve/sessionState.js";
import type { EveSessionRef } from "../../../eve/types.js";

export type EveTurnOutcome =
	| { kind: "answered"; catalogDecision?: CatalogPlanPreview; text: string }
	| { kind: "parked"; question?: PendingQuestion; text: string }
	| { kind: "silent" }
	| { kind: "stopped"; stopReason: RunStopReason; text: string }
	| { approval: AgentApprovalRequest; kind: "suspended"; text: string }
	| { kind: "unreachable" };

export const eveTurnProducedOutput = ({
	catalogDecision,
	text,
}: {
	catalogDecision?: unknown;
	text?: string;
}) => Boolean(text?.trim() || catalogDecision);

export type EveTurnProgress = {
	finalText: string;
	lastPreview?: CapturedPreview;
	pendingText: string;
	reasoningStreamId?: string;
	toolInputs: Map<string, Record<string, unknown>>;
	toolLabels: Map<string, string>;
	// Eve replays the previous turn's terminal events before this turn starts.
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
	// Catalog decisions and approval cards need the same enriched preview.
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
		// Failed previews retire any prior preview to avoid stale approval data.
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
	// Requested actions already surfaced their status.
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
		progress.reasoningStreamId ??= crypto.randomUUID();
		onReasoning?.({ id: progress.reasoningStreamId, text: message });
		progress.reasoningStreamId = undefined;
		return;
	}
	closeReasoningStream({ onReasoning, progress });
	progress.finalText = message;
};

const approvalForGatedWrite = ({
	chained,
	progress,
	siblingRequestIds,
}: {
	chained: ChainedPendingRequest;
	progress: EveTurnProgress;
	siblingRequestIds: string[];
}): AgentApprovalRequest => {
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
			approval: approvalForGatedWrite({
				chained: parked.chained,
				progress,
				siblingRequestIds: parked.siblingRequestIds,
			}),
			kind: "suspended",
			text: progress.finalText,
		};
	}

	if (progress.pendingText) progress.finalText = progress.pendingText;
	if (!eveTurnProducedOutput({ text: progress.finalText })) {
		progress.finalText =
			textForInputRequests(requests) || WAITING_FOR_INPUT_MESSAGE;
	}
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
	const catalogDecision = catalogPlanNeedingDecision(
		progress.lastPreview?.preview,
	);
	if (eveTurnProducedOutput({ catalogDecision, text: progress.finalText })) {
		return { kind: "answered", catalogDecision, text: progress.finalText };
	}
	return { kind: "silent" };
};

export const applyEveEvent = async (
	context: EveEventContext,
): Promise<EveTurnOutcome | undefined> => {
	const { event, onThinking, orgId, progress, session } = context;
	switch (event.type) {
		case "turn.started":
			progress.turnStarted = true;
			// Follow-up turns must not inherit stale previews.
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
