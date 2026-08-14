import Anthropic from "@anthropic-ai/sdk";
import { type AppEnv, cmaSessions, type ChatProvider } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { AgentThreadRef } from "../../internal/agentRuntime/domain/agentTurnContext.js";
import {
	isSilentTool,
	sandboxToolLabel,
	toolLabel,
} from "../../internal/agentRuntime/tools/toolPolicy.js";
import { extractUserMessageText } from "../../internal/agentRuntime/messages/agentMessageText.js";
import { buildAgentThreadKey } from "../../internal/agentRuntime/sessions/agentThreadKey.js";
import { chatApprovalRepo } from "../../internal/approvals/repos/chatApprovalRepo.js";
import type { ChatDb } from "../../lib/db.js";
import { parsePreviewPayload } from "../../ui/previewContent.js";
import type {
	LeafApprovalStatus,
	LeafUiMessage,
	TimestampedMessage,
} from "./types.js";

const client = new Anthropic();

const textFromContent = (content: Array<{ text?: string; type: string }>) =>
	content
		.filter((block) => block.type === "text" && block.text)
		.map((block) => block.text)
		.join("");

const replaySession = async (sessionId: string) => {
	const messages: TimestampedMessage[] = [];
	let current: TimestampedMessage | undefined;
	let lastTs = 0;
	const flush = () => {
		if (current?.msg.parts.length) messages.push(current);
		current = undefined;
	};
	const assistant = () => {
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
					msg: {
						id: event.id,
						parts: [{ text, type: "text" }],
						role: "user",
					},
					ts: lastTs,
				});
			}
		} else if (
			event.type === "agent.mcp_tool_use" &&
			event.mcp_server_name === "autumn" &&
			!isSilentTool(event.name)
		) {
			assistant().msg.parts.push({
				data: { label: toolLabel(event.name), status: "done" },
				id: event.id,
				type: "data-step",
			});
		} else if (event.type === "agent.tool_use") {
			assistant().msg.parts.push({
				data: {
					label: sandboxToolLabel(event.name, event.input),
					status: "done",
				},
				id: event.id,
				type: "data-step",
			});
		} else if (event.type === "agent.message") {
			const message = assistant();
			const text = textFromContent(event.content);
			if (text.trim()) message.msg.parts.push({ text, type: "text" });
			message.ts = lastTs;
		}
	}
	flush();
	return messages;
};

const approvalStatus = (status: string): LeafApprovalStatus => {
	if (status === "approved") return "approved";
	if (status === "pending") return "pending";
	return "rejected";
};

/** Preserves read-only access to dashboard threads created before Eve. */
export const buildLegacyClaudeHistory = async ({
	channelId,
	db,
	env,
	orgId,
	provider,
	thread,
	workspaceId,
}: {
	channelId: string;
	db: ChatDb;
	env: AppEnv;
	orgId: string;
	provider: ChatProvider;
	thread: AgentThreadRef;
	workspaceId: string;
}): Promise<LeafUiMessage[] | undefined> => {
	const session = await db.query.cmaSessions.findFirst({
		where: and(
			eq(cmaSessions.org_id, orgId),
			eq(cmaSessions.env, env),
			eq(cmaSessions.thread_key, buildAgentThreadKey({ env, thread })),
		),
	});
	if (!session) return undefined;

	const [timeline, approvals] = await Promise.all([
		replaySession(session.session_id),
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
	const standalones: TimestampedMessage[] = [];

	for (const approval of approvals) {
		const args = approval.tool_args;
		const part = {
			data: {
				approvalId: approval.id,
				params:
					args && typeof args === "object" && "request" in args
						? args.request
						: args,
				preview: parsePreviewPayload(approval.preview),
				status: approvalStatus(approval.status),
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
		if (owner) owner.msg.parts.push(part);
		else {
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
