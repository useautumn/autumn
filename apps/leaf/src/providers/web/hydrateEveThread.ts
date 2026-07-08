import type { AppEnv, CatalogPlanPreview, ChatProvider } from "@autumn/shared";
import { normalizeToolName } from "../../agent/tools/toolPolicy.js";
import type {
	LeafApprovalStatus,
	LeafUiMessage,
	TimestampedMessage,
} from "../../harness/claudeManaged/session/sessionEventsToUiMessages.js";
import { extractUserMessageText } from "../../harness/common/messageText.js";
import { catalogPlanNeedingDecision } from "../../harness/eve/catalogDecision.js";
import { streamEveEvents } from "../../harness/eve/client.js";
import {
	displayEveToolLabel,
	type EveAction,
	type EveActionResult,
	type EveInputRequest,
	isPreviewToolName,
	labelForResult,
	textForInputRequests,
} from "../../harness/eve/events.js";
import type { EveAuthContext, EveSessionRef } from "../../harness/eve/types.js";
import { chatApprovalRepo } from "../../internal/approvals/repos/chatApprovalRepo.js";
import type { ChatDb } from "../../lib/db.js";
import { parsePreviewPayload } from "../../ui/previewContent.js";

const unwrapRequest = (args: unknown) =>
	args && typeof args === "object" && "request" in args
		? (args as { request: unknown }).request
		: args;

const toApprovalStatus = (status: string): LeafApprovalStatus => {
	if (status === "approved") return "approved";
	if (status === "pending" || status === "running") return "pending";
	return "rejected";
};

const eventTs = (at?: string) => {
	const parsed = at ? Date.parse(at) : NaN;
	return Number.isFinite(parsed) ? parsed : Date.now();
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

const eveEventsToUiMessages = async ({
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
	// The one live part not replayable from a single event: a preview that needs
	// versioning/variant decisions renders a card when its turn ends unanswered.
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
		const ts = eventTs(event.meta?.at);
		if (event.type === "message.received") {
			const text = extractUserMessageText(String(event.data?.message ?? ""));
			// Eve holds a follow-up sent during a pending approval and replays it
			// once resolved — the replay is a second message.received with the same
			// text, so a repeated consecutive user message is an echo, not a send.
			const lastUser = [...timeline]
				.reverse()
				.find((item) => item.msg.role === "user");
			const lastUserPart = lastUser?.msg.parts[0];
			const isEcho =
				lastUserPart?.type === "text" && lastUserPart.text === text;
			if (text.trim() && !isEcho) {
				timeline.push({
					msg: {
						id: `eve-user-${String(event.data?.turnId ?? crypto.randomUUID())}`,
						parts: [{ text, type: "text" }],
						role: "user",
					},
					ts,
				});
				// The user moved on — a decision card is only re-rendered when it's
				// still the thread's trailing state.
				pendingDecision = undefined;
			}
		} else if (event.type === "actions.requested") {
			const actions = (event.data?.actions ?? []) as EveAction[];
			for (const action of actions) {
				if (action.callId)
					toolCalls.set(action.callId, {
						label: displayEveToolLabel(action),
						startedAt: ts,
					});
			}
		} else if (event.type === "action.result") {
			const result = event.data?.result as EveActionResult | undefined;
			const callId = result?.callId;
			const toolCall = callId ? toolCalls.get(callId) : undefined;
			const label =
				toolCall?.label ?? displayEveToolLabel(labelForResult(result));
			assistantForTurn(event.data?.turnId, ts).msg.parts.push({
				data: {
					finishedAt: ts,
					label,
					startedAt: toolCall?.startedAt ?? ts,
					status: event.data?.status === "failed" ? "error" : "done",
				},
				id: callId ?? crypto.randomUUID(),
				type: "data-step",
			});
			if (callId) toolCalls.delete(callId);
			if (
				event.data?.status === "completed" &&
				result?.toolName &&
				isPreviewToolName(result.toolName)
			) {
				const plan = catalogPlanNeedingDecision(
					parsePreviewPayload(result.output) ?? result.output,
				);
				pendingDecision = plan
					? { message: assistantForTurn(event.data?.turnId, ts), plan }
					: undefined;
			}
		} else if (event.type === "input.requested") {
			const requests = (event.data?.requests ?? []) as EveInputRequest[];
			// Approval-shaped requests re-render from chat_approvals, not replay.
			const isApproval = requests.some(
				(request) =>
					request.requestId &&
					request.action?.toolName &&
					normalizeToolName(request.action.toolName) !== "ask_question",
			);
			if (!isApproval) {
				const assistant = assistantForTurn(event.data?.turnId, ts);
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
			const text = String(event.data?.reasoning ?? "");
			if (text.trim()) {
				assistantForTurn(event.data?.turnId, ts).msg.parts.push({
					data: { text },
					id: crypto.randomUUID(),
					type: "data-reasoning",
				});
			}
		} else if (event.type === "message.completed") {
			const text = String(event.data?.message ?? "");
			if (!text.trim()) continue;
			const assistant = assistantForTurn(event.data?.turnId, ts);
			if (event.data?.finishReason === "tool-calls") {
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

export const buildEveWebHistory = async ({
	auth,
	channelId,
	db,
	env,
	orgId,
	provider,
	session,
	workspaceId,
}: {
	auth: EveAuthContext;
	channelId: string;
	db: ChatDb;
	env: AppEnv;
	orgId: string;
	provider: ChatProvider;
	session: EveSessionRef;
	workspaceId: string;
}): Promise<LeafUiMessage[]> => {
	const [timeline, approvals] = await Promise.all([
		eveEventsToUiMessages({ auth, session }),
		chatApprovalRepo.listForChannel({
			channelId,
			db,
			env,
			orgId,
			provider,
			workspaceId,
		}),
	]);

	const ordered = [...timeline].sort((a, b) => a.ts - b.ts);
	// A live pending approval owns the thread's trailing state — the replayed
	// preview must not also render a decision card beside it.
	const hasPendingApproval = approvals.some(
		(approval) => toApprovalStatus(approval.status) === "pending",
	);
	if (hasPendingApproval) {
		for (const item of ordered) {
			item.msg.parts = item.msg.parts.filter(
				(part) => part.type !== "data-catalog-decision",
			);
		}
	}
	const standalones: TimestampedMessage[] = [];
	for (const approval of approvals) {
		const part = {
			data: {
				approvalId: approval.id,
				params: unwrapRequest(approval.tool_args),
				preview: parsePreviewPayload(approval.preview),
				status: toApprovalStatus(approval.status),
				toolName: approval.tool_name,
			},
			id: approval.id,
			type: "data-approval" as const,
		};
		const owner = [...ordered]
			.reverse()
			.find(
				(item) =>
					item.msg.role === "assistant" && item.ts <= approval.created_at,
			);
		if (owner) {
			owner.msg.parts.push(part);
		} else {
			standalones.push({
				msg: {
					id: `approval-${approval.id}`,
					parts: [part],
					role: "assistant",
				},
				ts: approval.created_at,
			});
		}
	}

	return [...ordered, ...standalones]
		.sort((a, b) => a.ts - b.ts)
		.map((item) => item.msg);
};
