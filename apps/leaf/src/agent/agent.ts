import type { AutumnLogger } from "@autumn/logging";
import { AppEnv } from "@autumn/shared";
import { Agent } from "@mastra/core/agent";
import type { MessageListInput } from "@mastra/core/agent/message-list";
import { z } from "zod";
import { env as chatEnv } from "../lib/env.js";
import { logger as rootLogger } from "../lib/logger.js";
import { createE2bSandboxProvider } from "../providers/e2b/e2bSandboxProvider.js";
import type { ChatContextMessage } from "../types.js";
import { createFirecrawlTools } from "./firecrawl.js";
import { createAutumnMcpClient, getAutumnMcpTools } from "./mcp.js";
import { sandboxConfig } from "./sandbox/config.js";
import { createSandboxTools } from "./sandbox/createSandboxTools.js";

export const agentDocUris = [
	"autumn://docs/tool-composition",
	"autumn://docs/feature-catalog",
	"autumn://docs/querying-plans",
	"autumn://docs/querying-customers",
	"autumn://docs/schedules",
	"autumn://docs/balances",
	"autumn://docs/billing-safety",
	"autumn://docs/request-logs",
	"autumn://docs/request-log-customers",
	"autumn://docs/request-log-balances",
	"autumn://docs/request-log-billing",
	"autumn://docs/request-log-stripe-webhooks",
	"autumn://docs/request-log-analytics",
];

const instructions = `You are Autumn Chat.
Use Autumn MCP tools for customer, plan, balance, schedule, and billing work.
Use web search only for current or external web context. Never use web search for Autumn customer, plan, billing, balance, or schedule state.
When web content influences the answer, cite the source URLs.
Prefer searchWeb first, then scrapeUrl only for the most relevant result.
Use listFeatures only when creating/customizing plan items or setting non-zero prepaid feature quantities and feature ids/types are not already known; never invent feature ids.
Use the sandbox only for short parsing, calculation, transformation, and file-analysis tasks. Never send secrets to the sandbox, never use it for Autumn writes, and treat sandbox output as advisory.
Preview billing-impacting changes first, summarize the preview in short Slack-friendly bullets, then call the matching write tool with the same request args.
When Autumn responses include epoch millisecond timestamps, use epochMillisecondsToDate before explaining those timestamps to a user.
Treat Slack PDFs and images attached to the latest message as part of the user's request. If an attachment was skipped or unavailable, say so briefly instead of pretending to have read it.
The runtime pauses destructive tools for approval before execution, so do not ask for confirmation in plain text.`;

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
		const agent = new Agent({
			id: "autumn-chat",
			name: "Autumn Chat",
			instructions: `${instructions}\n\nCurrent Autumn environment: ${env}.\n\n${docsText}`,
			model: chatEnv.CHAT_MODEL,
			tools: { ...tools, ...firecrawlTools, ...sandboxTools },
		});

		const output = await agent.generate(message, {
			maxSteps: 8,
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
