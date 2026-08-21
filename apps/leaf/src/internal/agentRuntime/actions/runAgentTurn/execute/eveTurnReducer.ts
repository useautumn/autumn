import type { CatalogPlanPreview } from "@autumn/shared";
import { logger } from "../../../../../lib/logger.js";
import { WAITING_FOR_INPUT_MESSAGE } from "../../../../../ui/messages.js";
import type { RunStopReason } from "../../../../runs/runRegistry.js";
import type { AgentApprovalRequest } from "../../../domain/agentTurn.js";
import type { AgentActionProgress } from "../../../domain/agentTurnContext.js";
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
	childSessionIdsToolArgs,
	classifyParkedEveInput,
	type PendingQuestion,
	siblingRequestIdsToolArgs,
	type WithheldWrite,
	withheldWritesToolArgs,
} from "../../../eve/parkedInput.js";
import {
	type CapturedPreview,
	previewForParkedWrite,
} from "../../../eve/parkedWritePreview.js";
import { isSilentTool, toolGerund } from "../../../tools/toolPolicy.js";
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
	subagentChildSessionIds: ReadonlySet<string>;
	subagentStartedAtByCallId: ReadonlyMap<string, number>;
	toolInputs: ReadonlyMap<string, Record<string, unknown>>;
	toolLabels: ReadonlyMap<string, string>;
	turnStarted: boolean;
}>;

export type EveTurnEffect =
	| Readonly<{ kind: "action"; progress: AgentActionProgress }>
	| Readonly<{ kind: "delete_session" }>
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
	subagentChildSessionIds: new Set(),
	subagentStartedAtByCallId: new Map(),
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
	withheld,
}: {
	chained: ChainedPendingRequest;
	progress: EveTurnProgress;
	siblingRequestIds: ReadonlyArray<string>;
	withheld: ReadonlyArray<WithheldWrite>;
}): AgentApprovalRequest => {
	const options = approvalOptionIds({ options: chained.options });
	return {
		toolCallId: chained.requestId,
		toolName: chained.toolName,
		toolArgs: {
			...(chained.input ?? {}),
			_eveApproveOptionId: options.approve,
			_eveDenyOptionId: options.deny,
			// A proxied approval executes inside the delegated child session, so
			// the resume verifies the write from the child's stream.
			...childSessionIdsToolArgs([...progress.subagentChildSessionIds]),
			...siblingRequestIdsToolArgs(siblingRequestIds),
			...withheldWritesToolArgs(withheld),
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
			effects.push({
				kind: "action",
				progress: {
					label,
					phase: "started",
					toolName: action.toolName,
				},
			});
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
	logger.info("Eve tool completed", {
		event: "leaf.eve_tool_completed",
		data: {
			call_id: result.callId,
			status: event.status,
			tool: result.toolName,
		},
	});
	const effects: EveTurnEffect[] = [];
	if (
		progress.turnStarted &&
		!(result.toolName && isSilentTool(result.toolName))
	) {
		effects.push({
			kind: "action",
			progress: {
				label:
					progress.toolLabels.get(result.callId) ??
					displayEveToolLabel(labelForResult(result)),
				output: result.output,
				phase: "completed",
				status: event.status,
				toolName: result.toolName,
			},
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
	logger.info("Eve parked input", {
		event: "leaf.eve_input_parked",
		data: {
			kind: parked?.kind,
			request_count: event.requests.length,
			tools: event.requests.map((request) => request.action?.toolName),
		},
	});
	if (parked?.kind === "gated") {
		return {
			effects: [{ kind: "save_session", status: "waiting" }],
			outcome: {
				approval: approvalForGatedWrite({
					chained: parked.chained,
					progress,
					siblingRequestIds: parked.siblingRequestIds,
					withheld: parked.withheld,
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
			progress: {
				...progress,
				lastPreview: undefined,
				turnStarted: true,
			},
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
		case "subagent.called": {
			const name = event.name ?? event.toolName ?? "subagent";
			const subagentChildSessionIds = event.childSessionId
				? new Set([...progress.subagentChildSessionIds, event.childSessionId])
				: progress.subagentChildSessionIds;
			logger.info("Eve subagent called", {
				event: "leaf.eve_subagent_called",
				data: { child_session_id: event.childSessionId, subagent: name },
			});
			return {
				effects: [
					{
						kind: "action",
						progress: {
							label: toolGerund(name),
							phase: "started",
							toolName: name,
						},
					},
				],
				progress: {
					...progress,
					subagentChildSessionIds,
					subagentStartedAtByCallId: event.callId
						? new Map([
								...progress.subagentStartedAtByCallId,
								[event.callId, Date.now()],
							])
						: progress.subagentStartedAtByCallId,
				},
			};
		}
		case "subagent.completed": {
			const startedAt = event.callId
				? progress.subagentStartedAtByCallId.get(event.callId)
				: undefined;
			logger.info("Eve subagent completed", {
				event: "leaf.eve_subagent_completed",
				data: {
					duration_ms:
						startedAt === undefined ? undefined : Date.now() - startedAt,
					subagent: event.subagentName ?? "subagent",
				},
			});
			return { effects: [], progress };
		}
		case "step.started":
			return { effects: [{ kind: "thinking" }], progress };
		case "message.appended":
			return reduceMessageDelta({ createReasoningId, event, progress });
		case "message.completed":
			return reduceCompletedMessage({ createReasoningId, event, progress });
		case "input.requested":
			return reduceInputRequest({ event, progress });
		case "session.failed":
			return {
				effects: [
					{ kind: "save_session", status: "failed" },
					{ kind: "delete_session" },
					{ kind: "throw", message: event.message },
				],
				progress,
			};
		case "turn.failed":
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
