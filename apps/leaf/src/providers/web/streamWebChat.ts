import crypto from "node:crypto";
import { AppEnv, type ChatProvider } from "@autumn/shared";
import {
	createUIMessageStream,
	createUIMessageStreamResponse,
	type UIMessage,
} from "ai";
import { agentEngines } from "../../agent/runMessage/engines/engines.js";
import type {
	MessageAttachment,
	MessageContext,
} from "../../agent/runMessage/types.js";
import type { LeafUiMessage } from "../../harness/claudeManaged/session/sessionEventsToUiMessages.js";
import { presentWebApproval } from "../../internal/approvals/surfaces/web/present.js";
import {
	ensureWebChatAuth,
	WEB_CHAT_PROVIDER,
} from "../../internal/installations/actions/ensureWebChatAuth.js";
import { getOrgInstallationToken } from "../../internal/installations/actions/getOrgInstallationToken.js";
import { logger as rootLogger } from "../../lib/logger.js";
import { parsePreviewPayload } from "../../ui/previewContent.js";
import { buildWebChatThreadId, webThreadRef } from "./webThread.js";

const HARNESS = "claude-managed" as const;
const DATA_URL_REGEX = /^data:([^;]+);base64,(.*)$/s;

const dataUrlToAttachment = (
	url: string,
	name?: string,
): MessageAttachment | null => {
	const match = DATA_URL_REGEX.exec(url);
	return match
		? { data: Buffer.from(match[2], "base64"), mimeType: match[1], name }
		: null;
};

const parseRequest = (body: { id?: string; messages?: UIMessage[] }) => {
	const lastUser = [...(body.messages ?? [])]
		.reverse()
		.find((message) => message.role === "user");
	const parts = lastUser?.parts ?? [];
	const text = parts
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("");
	const attachments = parts.flatMap((part) =>
		part.type === "file" && part.url
			? ([dataUrlToAttachment(part.url, part.filename)].filter(
					Boolean,
				) as MessageAttachment[])
			: [],
	);
	return { attachments, conversationId: body.id, text };
};

const withCors = (response: Response, origin?: string) => {
	if (!origin) return response;
	const headers = new Headers(response.headers);
	headers.set("Access-Control-Allow-Origin", origin);
	headers.set("Access-Control-Allow-Credentials", "true");
	headers.set("Vary", "Origin");
	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
	});
};

/**
 * Dashboard chat for the claude-managed harness: run the agent and emit a native
 * AI SDK stream (text + `data-step` tool activity + `data-approval`) instead of
 * the chat-sdk web adapter's text-only path. The CMA session is the transcript,
 * so no chat-sdk persistence is needed — refresh hydrates from session events.
 */
export const streamWebChat = async ({
	auth,
	origin,
	request,
}: {
	auth: { orgId: string; userId: string; scopes: string[] };
	origin?: string;
	request: Request;
}): Promise<Response> => {
	const body = (await request.json()) as {
		id?: string;
		messages?: UIMessage[];
	};
	const { attachments, conversationId, text } = parseRequest(body);
	if (!conversationId) {
		return new Response("Missing conversation id", { status: 400 });
	}

	const { orgId, userId, scopes } = auth;
	const env = AppEnv.Sandbox;
	const logger = rootLogger;
	const chatThreadId = buildWebChatThreadId({ conversationId, orgId, userId });
	const thread = webThreadRef({ chatThreadId, orgId });

	const stream = createUIMessageStream<LeafUiMessage>({
		execute: async ({ writer }) => {
			await ensureWebChatAuth({ orgId, userId, userScopes: scopes });
			const { accessToken } = await getOrgInstallationToken({
				env,
				orgId,
				provider: WEB_CHAT_PROVIDER as ChatProvider,
				workspaceId: orgId,
				userId,
			});

			let lastStep: { id: string; label: string } | undefined;
			const finishLastStep = () => {
				if (!lastStep) return;
				writer.write({
					data: { label: lastStep.label, status: "done" },
					id: lastStep.id,
					type: "data-step",
				});
				lastStep = undefined;
			};
			const writeText = (value: string) => {
				if (!value.trim()) return;
				const id = crypto.randomUUID();
				writer.write({ id, type: "text-start" });
				writer.write({ delta: value, id, type: "text-delta" });
				writer.write({ id, type: "text-end" });
			};

			const ctx: MessageContext = {
				agentTools: { destructiveTools: new Set<string>() },
				env,
				id: crypto.randomUUID(),
				logger,
				onAction: (label) => {
					finishLastStep();
					const id = crypto.randomUUID();
					lastStep = { id, label };
					writer.write({
						data: { label, status: "running" },
						id,
						type: "data-step",
					});
				},
				// Tool errors / transient retries — surface as an error step so the
				// user sees something went wrong mid-turn.
				onActionKeyed: ({ message }) => {
					finishLastStep();
					writer.write({
						data: { label: message, status: "error" },
						id: crypto.randomUUID(),
						type: "data-step",
					});
				},
				// The managed-agent API exposes thinking only as a progress ping (no
				// text). Use it to close the last tool step once inference resumes, so
				// it stops showing a running clock while the model reasons.
				onThinking: () => finishLastStep(),
				onTurnComplete: (turnText) => {
					finishLastStep();
					writeText(turnText);
				},
				org: { id: orgId },
				providerUserId: userId,
				thread,
				timestamp: Date.now(),
				token: accessToken,
			};

			const output = await agentEngines[HARNESS].run({
				ctx,
				params: { attachments, text },
			});

			finishLastStep();
			if (output.text) writeText(output.text);

			if (output.suspension) {
				// presentWebApproval backfills the preview (the agent may write
				// without a preceding preview call), so use its returned preview —
				// not output.suspension.preview, which can be empty.
				const approval = await presentWebApproval({
					channelId: thread.channelId,
					harness: HARNESS,
					logger,
					orgId,
					output,
					provider: WEB_CHAT_PROVIDER as ChatProvider,
					providerUserId: userId,
					token: accessToken,
					workspaceId: orgId,
				});
				if (approval) {
					writer.write({
						data: {
							approvalId: approval.approvalId,
							params: approval.params,
							preview: parsePreviewPayload(approval.preview),
							status: "pending",
							toolName: approval.toolName,
						},
						id: approval.approvalId,
						type: "data-approval",
					});
				}
			}
		},
		onError: (error) => {
			logger.error("Web chat stream failed", {
				event: "leaf.web_chat_stream_failed",
				data: { error: String(error) },
			});
			return "Something went wrong. Please try again.";
		},
	});

	return withCors(createUIMessageStreamResponse({ stream }), origin);
};
