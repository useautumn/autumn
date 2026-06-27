import type Anthropic from "@anthropic-ai/sdk";
import type { UIMessage } from "ai";
import { formatToolAction } from "../../../agent/tools/autumnMcp.js";
import {
	isSilentTool,
	sandboxToolLabel,
} from "../../../agent/tools/toolPolicy.js";
import { extractUserMessageText } from "../../common/messageText.js";
import { claudeManagedConfig } from "../config.js";

export type LeafApprovalStatus = "pending" | "approved" | "rejected";

/** The dashboard's data-part schema, shared by live streaming + history replay. */
export type LeafUiMessage = UIMessage<
	never,
	{
		approval: {
			approvalId: string;
			params?: unknown;
			preview: unknown;
			status: LeafApprovalStatus;
			toolName?: string;
		};
		step: { label: string; status: "running" | "done" | "error" };
	}
>;

/** A message plus the timestamp used to interleave it with approval cards. */
export type TimestampedMessage = { msg: LeafUiMessage; ts: number };

const textFromContent = (
	content: Array<{ text?: string; type: string }>,
): string =>
	content
		.filter((block) => block.type === "text" && block.text)
		.map((block) => block.text)
		.join("");

/**
 * Replay a Claude Managed session into dashboard UI messages: user/assistant
 * text plus a `data-step` per Autumn tool call (the CMA session is the
 * transcript, so this matches what the live stream produces). Approval cards are
 * merged separately from `chat_approvals`.
 */
export const sessionEventsToUiMessages = async ({
	client,
	sessionId,
}: {
	client: Anthropic;
	sessionId: string;
}): Promise<TimestampedMessage[]> => {
	const messages: TimestampedMessage[] = [];
	let current: TimestampedMessage | undefined;
	let lastTs = 0;

	const flush = () => {
		if (current && current.msg.parts.length > 0) messages.push(current);
		current = undefined;
	};
	const openAssistant = (): TimestampedMessage => {
		current ??= {
			msg: { id: crypto.randomUUID(), parts: [], role: "assistant" },
			ts: lastTs,
		};
		return current;
	};

	for await (const event of client.beta.sessions.events.list(sessionId)) {
		if ("processed_at" in event && typeof event.processed_at === "string") {
			const parsed = Date.parse(event.processed_at);
			if (Number.isFinite(parsed)) lastTs = parsed;
		}

		if (event.type === "user.message") {
			flush();
			const text = extractUserMessageText(textFromContent(event.content));
			if (text.trim()) {
				messages.push({
					msg: { id: event.id, parts: [{ text, type: "text" }], role: "user" },
					ts: lastTs,
				});
			}
		} else if (event.type === "agent.mcp_tool_use") {
			if (
				event.mcp_server_name === claudeManagedConfig.autumnMcpServerName &&
				!isSilentTool(event.name)
			) {
				openAssistant().msg.parts.push({
					data: {
						label: formatToolAction({
							args: event.input,
							toolName: event.name,
						}),
						status: "done",
					},
					id: event.id,
					type: "data-step",
				});
			}
		} else if (event.type === "agent.tool_use") {
			// Sandbox builtin tools (e.g. `read` loading a skill) — surface as steps.
			openAssistant().msg.parts.push({
				data: {
					label: sandboxToolLabel(event.name, event.input),
					status: "done",
				},
				id: event.id,
				type: "data-step",
			});
		} else if (event.type === "agent.message") {
			const assistant = openAssistant();
			const text = textFromContent(event.content);
			if (text.trim()) assistant.msg.parts.push({ text, type: "text" });
			assistant.ts = lastTs;
		}
	}
	flush();
	return messages;
};
