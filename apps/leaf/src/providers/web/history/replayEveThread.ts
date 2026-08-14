import type { CatalogPlanPreview } from "@autumn/shared";
import { getTime, isValid, parseISO } from "date-fns";
import { catalogPlanNeedingDecision } from "../../../internal/agentRuntime/actions/resolveCatalogDecision/catalogDecisionPolicy.js";
import { streamEveEvents } from "../../../internal/agentRuntime/eve/client.js";
import {
	displayEveToolLabel,
	isPreviewToolName,
	labelForResult,
	textForInputRequests,
} from "../../../internal/agentRuntime/eve/events.js";
import type {
	EveAuthContext,
	EveSessionRef,
} from "../../../internal/agentRuntime/eve/types.js";
import { extractUserMessageText } from "../../../internal/agentRuntime/messages/agentMessageText.js";
import { normalizeToolName } from "../../../internal/agentRuntime/tools/toolPolicy.js";
import { parsePreviewPayload } from "../../../ui/previewContent.js";
import type { TimestampedMessage } from "../types.js";

const eventTs = (at?: string) => {
	const parsed = at ? parseISO(at) : undefined;
	return parsed && isValid(parsed) ? getTime(parsed) : Date.now();
};

const collectEveEvents = async ({
	auth,
	session,
}: {
	auth: EveAuthContext;
	session: EveSessionRef;
}) => {
	const tailIndex = session.state.streamIndex;
	if (tailIndex <= 0) return [];

	const replaySession: EveSessionRef = {
		...session,
		state: { ...session.state, streamIndex: 0 },
	};
	const abortController = new AbortController();
	const events = [];
	try {
		for await (const event of streamEveEvents({
			auth,
			session: replaySession,
			signal: abortController.signal,
		})) {
			events.push(event);
			replaySession.state.streamIndex += 1;
			if (replaySession.state.streamIndex >= tailIndex) {
				abortController.abort();
				break;
			}
		}
	} catch (error) {
		if (!(error instanceof DOMException && error.name === "AbortError")) {
			throw error;
		}
	}
	return events;
};

export const replayEveThread = async ({
	auth,
	session,
}: {
	auth: EveAuthContext;
	session: EveSessionRef;
}): Promise<TimestampedMessage[]> => {
	const timeline: TimestampedMessage[] = [];
	const assistantByTurn = new Map<string, TimestampedMessage>();
	const toolCalls = new Map<string, { label: string; startedAt: number }>();
	const questions: Array<{
		data: { status: "answered" | "pending" };
		ts: number;
	}> = [];
	let pendingDecision:
		| { message: TimestampedMessage; plan: CatalogPlanPreview }
		| undefined;

	const assistantForTurn = (turnId: unknown, ts: number) => {
		const key = typeof turnId === "string" ? turnId : "unknown";
		let message = assistantByTurn.get(key);
		if (!message) {
			message = {
				msg: { id: `eve-assistant-${key}`, parts: [], role: "assistant" },
				ts,
			};
			assistantByTurn.set(key, message);
			timeline.push(message);
		}
		message.ts = Math.min(message.ts, ts);
		return message;
	};

	for (const event of await collectEveEvents({ auth, session })) {
		const ts = eventTs(event.at);
		if (event.type === "message.received") {
			const text = extractUserMessageText(event.message);
			const lastUser = [...timeline]
				.reverse()
				.find((item) => item.msg.role === "user");
			const lastUserPart = lastUser?.msg.parts[0];
			const isEcho =
				lastUserPart?.type === "text" && lastUserPart.text === text;
			if (text.trim() && !isEcho) {
				timeline.push({
					msg: {
						id: `eve-user-${event.turnId ?? crypto.randomUUID()}`,
						parts: [{ text, type: "text" }],
						role: "user",
					},
					ts,
				});
				pendingDecision = undefined;
			}
		} else if (event.type === "actions.requested") {
			for (const action of event.actions) {
				if (action.callId) {
					toolCalls.set(action.callId, {
						label: displayEveToolLabel(action),
						startedAt: ts,
					});
				}
			}
		} else if (event.type === "action.result") {
			const result = event.result;
			const callId = result?.callId;
			const toolCall = callId ? toolCalls.get(callId) : undefined;
			const label =
				toolCall?.label ?? displayEveToolLabel(labelForResult(result));
			assistantForTurn(event.turnId, ts).msg.parts.push({
				data: {
					finishedAt: ts,
					label,
					startedAt: toolCall?.startedAt ?? ts,
					status: event.status === "failed" ? "error" : "done",
				},
				id: callId ?? crypto.randomUUID(),
				type: "data-step",
			});
			if (callId) toolCalls.delete(callId);
			if (
				event.status === "completed" &&
				result?.toolName &&
				isPreviewToolName(result.toolName)
			) {
				const plan = catalogPlanNeedingDecision(
					parsePreviewPayload(result.output) ?? result.output,
				);
				pendingDecision = plan
					? { message: assistantForTurn(event.turnId, ts), plan }
					: undefined;
			}
		} else if (event.type === "input.requested") {
			const requests = event.requests;
			const isApproval = requests.some(
				(request) =>
					request.requestId &&
					request.action?.toolName &&
					normalizeToolName(request.action.toolName) !== "ask_question",
			);
			if (!isApproval) {
				const assistant = assistantForTurn(event.turnId, ts);
				const optioned = requests.find(
					(request) =>
						request.prompt &&
						request.requestId &&
						(request.options?.length ?? 0) > 0,
				);
				if (optioned?.prompt && optioned.options && optioned.requestId) {
					assistant.msg.parts.push({ text: optioned.prompt, type: "text" });
					const data = {
						options: optioned.options,
						requestId: optioned.requestId,
						status: "pending" as "answered" | "pending",
					};
					assistant.msg.parts.push({
						data,
						id: optioned.requestId,
						type: "data-question",
					});
					questions.push({ data, ts });
				} else {
					const prompt = textForInputRequests(requests);
					if (prompt.trim()) {
						assistant.msg.parts.push({ text: prompt, type: "text" });
					}
				}
			}
		} else if (event.type === "reasoning.completed") {
			const text = event.reasoning;
			if (text.trim()) {
				assistantForTurn(event.turnId, ts).msg.parts.push({
					data: { text },
					id: crypto.randomUUID(),
					type: "data-reasoning",
				});
			}
		} else if (event.type === "message.completed") {
			const text = event.message;
			if (!text.trim()) continue;
			const assistant = assistantForTurn(event.turnId, ts);
			if (event.finishReason === "tool-calls") {
				assistant.msg.parts.push({
					data: { text },
					id: crypto.randomUUID(),
					type: "data-reasoning",
				});
			} else {
				assistant.msg.parts.push({ text, type: "text" });
			}
		}
	}

	const userTimes = timeline
		.filter((item) => item.msg.role === "user")
		.map((item) => item.ts);
	for (const question of questions) {
		if (userTimes.some((userTs) => userTs > question.ts)) {
			question.data.status = "answered";
		}
	}
	if (pendingDecision) {
		pendingDecision.message.msg.parts.push({
			data: { plan: pendingDecision.plan, status: "pending" },
			id: pendingDecision.plan.plan_id,
			type: "data-catalog-decision",
		});
	}

	return timeline.filter((item) => item.msg.parts.length > 0);
};
