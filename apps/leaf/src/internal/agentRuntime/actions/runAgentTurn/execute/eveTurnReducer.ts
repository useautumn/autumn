import type { CatalogPlanPreview } from "@autumn/shared";
import { WAITING_FOR_INPUT_MESSAGE } from "../../../../../ui/messages.js";
import type { RunStopReason } from "../../../../runs/runRegistry.js";
import type { AgentApprovalRequest } from "../../../domain/agentTurn.js";
import type { EveEvent } from "../../../eve/eveEventSchemas.js";
import {
	approvalOptionIds,
	displayEveToolLabel,
	isPreviewToolName,
	labelForResult,
	textForInputRequests,
} from "../../../eve/events.js";
import {
	type ChainedPendingRequest,
	classifyParkedEveInput,
	type PendingQuestion,
} from "../../../eve/parkedInput.js";
import {
	type CapturedPreview,
	previewForParkedWrite,
} from "../../../eve/parkedWritePreview.js";
import { isSilentTool } from "../../../tools/toolPolicy.js";
import { catalogPlanNeedingDecision } from "../../resolveCatalogDecision/catalogDecisionPolicy.js";

export type EveTurnOutcome =
	| { kind: "answered"; catalogDecision?: CatalogPlanPreview; text: string }
	| { kind: "parked"; question?: PendingQuestion; text: string }
	| { kind: "silent" }
	| { kind: "stopped"; stopReason: RunStopReason; text: string }
	| { approval: AgentApprovalRequest; kind: "suspended"; text: string }
	| { kind: "unreachable" };

export type EveTurnProgress = Readonly<{
	finalText: string;
	lastPreview?: CapturedPreview;
	pendingText: string;
	reasoningStreamId?: string;
	toolInputs: ReadonlyMap<string, Record<string, unknown>>;
	toolLabels: ReadonlyMap<string, string>;
	turnStarted: boolean;
}>;

export type EveTurnEffect =
	| Readonly<{ kind: "action"; message: string }>
	| Readonly<{ id: string; kind: "reasoning"; text: string }>
	| Readonly<{
			kind: "save_session";
			status: "completed" | "failed" | "waiting";
	  }>
	| Readonly<{ kind: "thinking" }>
	| Readonly<{ kind: "throw"; message: string }>;

export type EveTurnTransition = Readonly<{
	effects: ReadonlyArray<EveTurnEffect>;
	outcome?: EveTurnOutcome;
	progress: EveTurnProgress;
}>;

export const createEveTurnProgress = (): EveTurnProgress => ({
	finalText: "",
	pendingText: "",
	toolInputs: new Map(),
	toolLabels: new Map(),
	turnStarted: false,
});

export const eveTurnProducedOutput = ({
	catalogDecision,
	text,
}: {
	catalogDecision?: unknown;
	text?: string;
}) => Boolean(text?.trim() || catalogDecision);

const approvalForGatedWrite = ({
	chained,
	progress,
	siblingRequestIds,
}: {
	chained: ChainedPendingRequest;
	progress: EveTurnProgress;
	siblingRequestIds: ReadonlyArray<string>;
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

const reduceRequestedActions = ({
	event,
	progress,
}: {
	event: Extract<EveEvent, { type: "actions.requested" }>;
	progress: EveTurnProgress;
}): EveTurnTransition => {
	const toolInputs = new Map(progress.toolInputs);
	const toolLabels = new Map(progress.toolLabels);
	const effects: EveTurnEffect[] = [];
	for (const action of event.actions) {
		const label = displayEveToolLabel(action);
		if (
			progress.turnStarted &&
			!(action.toolName && isSilentTool(action.toolName))
		) {
			effects.push({ kind: "action", message: label });
		}
		if (!action.callId) continue;
		toolLabels.set(action.callId, label);
		if (action.input) toolInputs.set(action.callId, action.input);
	}
	return { effects, progress: { ...progress, toolInputs, toolLabels } };
};

const reduceActionResult = ({
	capturedPreview,
	event,
	progress,
}: {
	capturedPreview?: CapturedPreview;
	event: Extract<EveEvent, { type: "action.result" }>;
	progress: EveTurnProgress;
}): EveTurnTransition => {
	const result = event.result;
	const lastPreview =
		result?.toolName && isPreviewToolName(result.toolName)
			? capturedPreview
			: progress.lastPreview;
	if (!result?.callId) {
		return { effects: [], progress: { ...progress, lastPreview } };
	}
	const effects: EveTurnEffect[] = [];
	if (progress.turnStarted && !progress.toolLabels.has(result.callId)) {
		effects.push({
			kind: "action",
			message: displayEveToolLabel(labelForResult(result)),
		});
	}
	const toolLabels = new Map(progress.toolLabels);
	toolLabels.delete(result.callId);
	return {
		effects,
		progress: { ...progress, lastPreview, toolLabels },
	};
};

const reduceMessageDelta = ({
	createReasoningId,
	event,
	progress,
}: {
	createReasoningId: () => string;
	event: Extract<EveEvent, { type: "message.appended" }>;
	progress: EveTurnProgress;
}): EveTurnTransition => {
	const pendingText =
		typeof event.messageSoFar === "string"
			? event.messageSoFar
			: `${progress.pendingText}${event.messageDelta}`;
	const reasoningStreamId = progress.reasoningStreamId ?? createReasoningId();
	return {
		effects: [{ id: reasoningStreamId, kind: "reasoning", text: pendingText }],
		progress: { ...progress, pendingText, reasoningStreamId },
	};
};

const reduceCompletedMessage = ({
	createReasoningId,
	event,
	progress,
}: {
	createReasoningId: () => string;
	event: Extract<EveEvent, { type: "message.completed" }>;
	progress: EveTurnProgress;
}): EveTurnTransition => {
	const message = event.message || progress.pendingText;
	if (event.finishReason === "tool-calls") {
		const id = progress.reasoningStreamId ?? createReasoningId();
		return {
			effects: [{ id, kind: "reasoning", text: message }],
			progress: { ...progress, pendingText: "", reasoningStreamId: undefined },
		};
	}
	return {
		effects: progress.reasoningStreamId
			? [{ id: progress.reasoningStreamId, kind: "reasoning", text: "" }]
			: [],
		progress: {
			...progress,
			finalText: message,
			pendingText: "",
			reasoningStreamId: undefined,
		},
	};
};

const reduceInputRequest = ({
	event,
	progress,
}: {
	event: Extract<EveEvent, { type: "input.requested" }>;
	progress: EveTurnProgress;
}): EveTurnTransition => {
	const parked = classifyParkedEveInput({ requests: event.requests });
	if (parked?.kind === "gated") {
		return {
			effects: [{ kind: "save_session", status: "waiting" }],
			outcome: {
				approval: approvalForGatedWrite({
					chained: parked.chained,
					progress,
					siblingRequestIds: parked.siblingRequestIds,
				}),
				kind: "suspended",
				text: progress.finalText,
			},
			progress,
		};
	}
	const accumulatedText = progress.pendingText || progress.finalText;
	const text = eveTurnProducedOutput({ text: accumulatedText })
		? accumulatedText
		: textForInputRequests(event.requests) || WAITING_FOR_INPUT_MESSAGE;
	return {
		effects: [{ kind: "save_session", status: "waiting" }],
		outcome: {
			kind: "parked",
			question: parked?.kind === "question" ? parked.question : undefined,
			text,
		},
		progress,
	};
};

const reduceTerminalEvent = ({
	event,
	progress,
}: {
	event: Extract<EveEvent, { type: "session.completed" | "session.waiting" }>;
	progress: EveTurnProgress;
}): EveTurnTransition => {
	const text = progress.pendingText || progress.finalText;
	const catalogDecision = catalogPlanNeedingDecision(
		progress.lastPreview?.preview,
	);
	return {
		effects: [
			{
				kind: "save_session",
				status: event.type === "session.completed" ? "completed" : "waiting",
			},
		],
		outcome: eveTurnProducedOutput({ catalogDecision, text })
			? { catalogDecision, kind: "answered", text }
			: { kind: "silent" },
		progress,
	};
};

export const reduceEveTurnEvent = ({
	capturedPreview,
	createReasoningId = () => crypto.randomUUID(),
	event,
	progress,
}: {
	capturedPreview?: CapturedPreview;
	createReasoningId?: () => string;
	event: EveEvent;
	progress: EveTurnProgress;
}): EveTurnTransition => {
	if (event.type === "turn.started") {
		return {
			effects: [],
			progress: { ...progress, lastPreview: undefined, turnStarted: true },
		};
	}
	if (event.type === "actions.requested") {
		return reduceRequestedActions({ event, progress });
	}
	if (event.type === "action.result") {
		return reduceActionResult({ capturedPreview, event, progress });
	}
	if (!progress.turnStarted) return { effects: [], progress };

	switch (event.type) {
		case "step.started":
			return { effects: [{ kind: "thinking" }], progress };
		case "message.appended":
			return reduceMessageDelta({ createReasoningId, event, progress });
		case "message.completed":
			return reduceCompletedMessage({ createReasoningId, event, progress });
		case "input.requested":
			return reduceInputRequest({ event, progress });
		case "turn.failed":
		case "session.failed":
			return {
				effects: [
					{ kind: "save_session", status: "failed" },
					{ kind: "throw", message: event.message },
				],
				progress,
			};
		case "session.waiting":
		case "session.completed":
			return reduceTerminalEvent({ event, progress });
		default:
			return { effects: [], progress };
	}
};
