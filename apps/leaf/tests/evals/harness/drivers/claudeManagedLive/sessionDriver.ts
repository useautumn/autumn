import type Anthropic from "@anthropic-ai/sdk";
import { currentSpan, type Span } from "braintrust";
import { claudeManagedConfig } from "../../../../../src/harness/claudeManaged/config.js";
import { driveSessionTurn } from "../../../../../src/harness/claudeManaged/session/driveSessionTurn.js";
import { buildUserMessageContent } from "../../../../../src/harness/claudeManaged/session/userMessage.js";
import type { EvalDriverStartInput, EvalToolCall } from "../types.js";

type Attachment = { data: Buffer; mimeType: string; name?: string };

// Owns the CMA session state across turns: drives each turn through the prod
// driveSessionTurn, mirrors turns + tool calls into braintrust spans (so the
// thread shows there), and bridges the eval's multi-turn approval flow onto CMA's
// tool_confirmation model (deny a still-pending gate before the next user turn).
export const createLiveSessionDriver = ({
	client,
	sessionId,
	trace,
}: {
	client: Anthropic;
	sessionId: string;
	trace: EvalDriverStartInput["trace"];
}) => {
	const toolCalls: EvalToolCall[] = [];
	let pendingToolUseIds: string[] = [];

	const runTurn = async ({
		input,
		kickoff,
	}: {
		input?: string;
		kickoff: () => Promise<unknown>;
	}) => {
		pendingToolUseIds = [];
		const turnSpan = currentSpan().startSpan({
			name: input ? "user-turn" : "approval-turn",
			type: "llm",
			...(input ? { event: { input } } : {}),
		});
		const openToolSpans = new Map<string, Span>();
		const outcome = await driveSessionTurn({
			autumnMcpServerName: claudeManagedConfig.autumnMcpServerName,
			client,
			kickoff,
			onAutumnTool: ({ id, input: toolInput, name }) => {
				toolCalls.push({ args: toolInput, name });
				trace.event({ call: { args: toolInput, name }, type: "tool_call" });
				openToolSpans.set(
					id,
					turnSpan.startSpan({
						event: { input: toolInput },
						name,
						type: "tool",
					}),
				);
			},
			onAutumnToolResult: ({ id, output }) => {
				const toolSpan = openToolSpans.get(id);
				if (toolSpan) {
					toolSpan.log({ output });
					toolSpan.end();
					openToolSpans.delete(id);
				}
			},
			sessionId,
		}).catch((error) => {
			turnSpan.end();
			console.error("[cma-live] turn failed:", error);
			throw error;
		});
		if (outcome.suspendedQueue?.length) {
			pendingToolUseIds = outcome.suspendedQueue.map((call) => call.toolCallId);
			trace.event({ type: "approval_pending" });
		}
		const text = outcome.textParts.join("\n\n");
		turnSpan.log({ output: text });
		turnSpan.end();
		if (outcome.errorMessage && !text && !outcome.suspendedQueue?.length) {
			throw new Error(`CMA live eval turn failed: ${outcome.errorMessage}`);
		}
		trace.event({ text, type: "agent_text" });
		return { text };
	};

	return {
		approve: async () => {
			const [toolUseId] = pendingToolUseIds;
			if (!toolUseId) throw new Error("No pending approval to approve.");
			trace.event({ type: "approval_approved" });
			return runTurn({
				kickoff: () =>
					client.beta.sessions.events.send(sessionId, {
						events: [
							{
								result: "allow",
								tool_use_id: toolUseId,
								type: "user.tool_confirmation",
							},
						],
					}),
			});
		},
		getToolCalls: () => [...toolCalls],
		hasPendingApproval: () => pendingToolUseIds.length > 0,
		send: async ({
			attachments,
			text,
		}: {
			attachments?: Attachment[];
			text: string;
		}) => {
			// Denying can surface further queued confirmations; drain them all
			// before the session will accept a plain user message.
			while (pendingToolUseIds.length > 0) {
				const toDeny = [...pendingToolUseIds];
				pendingToolUseIds = [];
				await runTurn({
					kickoff: () =>
						client.beta.sessions.events.send(sessionId, {
							events: toDeny.map((toolUseId) => ({
								deny_message:
									"Preview and wait for explicit user confirmation before writing.",
								result: "deny",
								tool_use_id: toolUseId,
								type: "user.tool_confirmation",
							})),
						}),
				});
			}
			return runTurn({
				input: text,
				kickoff: () =>
					client.beta.sessions.events.send(sessionId, {
						events: [
							{
								content: buildUserMessageContent({ attachments, text }),
								type: "user.message",
							},
						],
					}),
			});
		},
	};
};
