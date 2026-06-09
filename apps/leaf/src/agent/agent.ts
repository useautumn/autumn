import type { AutumnLogger } from "@autumn/logging";
import { AppEnv } from "@autumn/shared";
import { Agent } from "@mastra/core/agent";
import type { MessageListInput } from "@mastra/core/agent/message-list";
import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { z } from "zod";
import { createLeafTracingOptions } from "../internal/observability/leafTracingOptions.js";
import { leafChatAgentDefaults } from "../lib/chatAgentConfig.js";
import { env as chatEnv } from "../lib/env.js";
import { logger as rootLogger } from "../lib/logger.js";
import { createMastraBraintrustObservability } from "../providers/braintrust/index.js";
import { createE2bSandboxProvider } from "../providers/e2b/e2bSandboxProvider.js";
import type { ChatContextMessage } from "../types.js";
import { agentDocUris, createAutumnChatAgent } from "./chatAgent.js";
import { createFirecrawlTools } from "./firecrawl.js";
import { createAutumnMcpClient, getAutumnMcpTools } from "./mcp.js";
import { sandboxConfig } from "./sandbox/config.js";
import { createSandboxTools } from "./sandbox/createSandboxTools.js";

export { agentDocUris, createAutumnChatAgent } from "./chatAgent.js";

const envSelectionSchema = z.strictObject({
	env: z.nativeEnum(AppEnv),
});

export const getDefaultChatEnv = () =>
	process.env.NODE_ENV === "production" ? AppEnv.Live : AppEnv.Sandbox;

const recentMessageContext = (messages: ChatContextMessage[] = []) =>
	messages.map((message) => ({
		role: message.isBot === true ? ("assistant" as const) : ("user" as const),
		content: `${message.author}${message.isBot === true ? " (bot)" : ""}: ${message.text}`,
	}));

export const selectChatEnv = async ({
	logger = rootLogger,
	message,
	recentMessages,
	select,
}: {
	logger?: AutumnLogger;
	message: string;
	recentMessages?: ChatContextMessage[];
	select?: () => Promise<unknown> | unknown;
}) => {
	if (select) {
		const env = envSelectionSchema.parse(await select()).env;
		logger.debug("Selected chat environment from override", {
			event: "leaf.chat_env_selected",
			context: { env },
			data: { source: "override" },
		});
		return env;
	}

	const agent = new Agent({
		id: "autumn-chat-env",
		name: "Autumn Chat Env",
		instructions: `Choose the Autumn environment for the latest user request. Default to ${getDefaultChatEnv()}. Use the other environment only when the user clearly asks for it.`,
		model: chatEnv.CHAT_MODEL,
	});
	const output = await agent.generate(message, {
		maxSteps: 1,
		structuredOutput: {
			schema: envSelectionSchema,
			instructions: `Return ${getDefaultChatEnv()} unless the latest user request clearly asks to use the other environment.`,
		},
		context: [...recentMessageContext(recentMessages)],
	});
	logger.debug("Selected chat environment from model", {
		event: "leaf.chat_env_selected",
		context: { env: output.object.env },
		data: { source: "model" },
	});
	return output.object.env;
};

const readDocs = async (mcp: ReturnType<typeof createAutumnMcpClient>) => {
	const resources = await Promise.allSettled(
		agentDocUris.map((uri) => mcp.resources.read("autumn", uri)),
	);
	return resources
		.flatMap((result) =>
			result.status === "fulfilled"
				? result.value.contents.flatMap((content) =>
						"text" in content ? [content.text] : [],
					)
				: [],
		)
		.join("\n\n");
};

export const runChatAgent = async ({
	token,
	env,
	logger = rootLogger,
	message,
	channelId,
	threadId,
	resourceId,
	onAction,
	provider,
	workspaceId,
	recentMessages,
	agentRunId,
	orgSlug,
}: {
	token: string;
	env: AppEnv;
	logger?: AutumnLogger;
	message: MessageListInput;
	channelId: string;
	onAction?: (message: string) => Promise<void> | void;
	threadId: string;
	resourceId: string;
	provider: string;
	workspaceId: string;
	agentRunId?: string;
	orgSlug?: string | null;
	recentMessages?: ChatContextMessage[];
}) => {
	const mcp = createAutumnMcpClient({
		token,
		appEnv: env,
		options: { requireApproval: true },
	});
	let previewApproval:
		| {
				toolName: string;
				toolArgs: Record<string, unknown>;
				preview: unknown;
		  }
		| undefined;
	try {
		logger.info("Starting chat agent", {
			event: "leaf.agent_started",
			context: {
				env,
				org_id: resourceId,
				provider,
			},
			data: {
				thread_id: threadId,
			},
		});
		await onAction?.("Loading Autumn tools and guidance");
		const [tools, docsText] = await Promise.all([
			getAutumnMcpTools({
				mcp,
				options: {
					applyApprovalPolicy: true,
					logger,
					onToolCall: onAction,
					onPreview: (approval) => {
						previewApproval = approval;
					},
				},
			}),
			readDocs(mcp),
		]);
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
								channelId,
								env,
								orgId: resourceId,
								provider,
								threadId,
								workspaceId,
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
			docsText,
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

		const output = await chatAgent.generate(message, {
			maxSteps: leafChatAgentDefaults.maxSteps,
			context: [
				{
					role: "system",
					content: [
						`${provider} thread: ${threadId}. Autumn resource: ${resourceId}.`,
						"Answer the latest user message. Use prior thread messages only as context.",
					]
						.filter(Boolean)
						.join("\n\n"),
				},
				...recentMessageContext(recentMessages),
			],
			tracingOptions: createLeafTracingOptions({
				agentRunId,
				channelId,
				env,
				orgId: resourceId,
				orgSlug,
				provider,
				source: "prod",
				threadId,
				workspaceId,
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
		return { ...output, env, previewApproval };
	} finally {
		await mcp.disconnect();
		logger.debug("Disconnected Autumn MCP client", {
			event: "leaf.mcp_client_disconnected",
		});
	}
};
