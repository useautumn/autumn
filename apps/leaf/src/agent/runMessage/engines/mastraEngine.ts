import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { createLeafTracingOptions } from "../../../internal/observability/leafTracingOptions.js";
import { sandboxConfig } from "../../../internal/sandbox/config.js";
import { createE2bSandboxProvider } from "../../../internal/sandbox/e2b/sandboxProvider.js";
import { createSandboxTools } from "../../../internal/sandbox/tool/createSandboxTools.js";
import { leafChatAgentDefaults } from "../../../lib/chatAgentConfig.js";
import { env as chatEnv } from "../../../lib/env.js";
import { createMastraBraintrustObservability } from "../../../providers/braintrust/index.js";
import { agentOutputSchema } from "../../../types.js";
import {
	createAutumnMcpClient,
	getAutumnMcpTools,
} from "../../tools/autumnMcp.js";
import { createFirecrawlTools } from "../../tools/firecrawl.js";
import { createPreviewCapture } from "../../tools/toolPolicy.js";
import { recentMessageContext } from "../setup/selectChatEnv.js";
import type { AgentEngine, MessageParams } from "../types.js";
import { createAutumnChatAgent } from "./autumnChatAgent.js";

const toMessageListInput = (params: MessageParams) => [
	{
		role: "user" as const,
		content: [
			...(params.attachments ?? []).map((attachment) => ({
				type: "file" as const,
				data: attachment.data,
				filename: attachment.name,
				mediaType: attachment.mimeType,
			})),
			{ type: "text" as const, text: params.text },
		],
	},
];

export const mastraEngine: AgentEngine = {
	name: "mastra",
	run: async ({ ctx, params }) => {
		const { agentTools, env, logger, onAction, org, thread, token } = ctx;
		const mcp = createAutumnMcpClient({
			token,
			appEnv: env,
			options: { requireApproval: true },
		});
		const previewCapture = createPreviewCapture();
		try {
			logger.info("Starting chat agent", {
				event: "leaf.agent_started",
				context: { env, org_id: org.id, provider: thread.provider },
				data: { thread_id: thread.threadId },
			});
			await onAction?.("Loading Autumn tools and guidance");
			const tools = await getAutumnMcpTools({
				mcp,
				options: {
					applyApprovalPolicy: true,
					logger,
					onToolCall: onAction,
					previewCapture,
				},
			});
			const firecrawlTools = createFirecrawlTools({
				apiKey: chatEnv.FIRECRAWL_API_KEY,
				onAction,
			});
			const sandboxTools =
				sandboxConfig.enabled && chatEnv.E2B_API_KEY
					? createSandboxTools({
							logger,
							onAction,
							provider: createE2bSandboxProvider({
								apiKey: chatEnv.E2B_API_KEY,
								context: {
									channelId: thread.channelId,
									env,
									orgId: org.id,
									provider: thread.provider,
									threadId: thread.threadId,
									workspaceId: thread.workspaceId,
								},
								sessionTimeoutMs: sandboxConfig.sessionTimeoutMs,
							}),
						})
					: {};
			if (sandboxConfig.enabled && !chatEnv.E2B_API_KEY) {
				logger.warn("Sandbox is enabled without an E2B API key", {
					event: "leaf.sandbox_disabled",
				});
			}
			await onAction?.("Reasoning over the request");
			const agent = createAutumnChatAgent({
				docsText: agentTools.docsText,
				env,
				model: chatEnv.CHAT_MODEL,
				tools: { ...tools, ...firecrawlTools, ...sandboxTools },
			});
			const mastra = new Mastra({
				agents: { chat: agent },
				environment: process.env.NODE_ENV,
				logger: false,
				observability: createMastraBraintrustObservability(),
				storage: new InMemoryStore({ id: `leaf-chat-${crypto.randomUUID()}` }),
			});
			const chatAgent = mastra.getAgent("chat");

			const output = await chatAgent.generate(toMessageListInput(params), {
				maxSteps: leafChatAgentDefaults.maxSteps,
				context: [
					{
						role: "system",
						content: [
							`${thread.provider} thread: ${thread.threadId}. Autumn resource: ${org.id}.`,
							"Answer the latest user message. Use prior thread messages only as context.",
						].join("\n\n"),
					},
					...recentMessageContext(params.recentMessages),
				],
				tracingOptions: createLeafTracingOptions({
					agentRunId: ctx.id,
					channelId: thread.channelId,
					env,
					orgId: org.id,
					orgSlug: org.slug,
					provider: thread.provider,
					source: "prod",
					threadId: thread.threadId,
					workspaceId: thread.workspaceId,
				}),
			});
			logger.info("Completed chat agent", {
				event: "leaf.agent_completed",
				context: { env },
				data: {
					finish_reason: output.finishReason,
					run_id: output.runId,
				},
			});
			return agentOutputSchema.parse({
				...output,
				env,
				previewApproval: previewCapture.captured,
			});
		} finally {
			await mcp.disconnect();
			logger.debug("Disconnected Autumn MCP client", {
				event: "leaf.mcp_client_disconnected",
			});
		}
	},
};
