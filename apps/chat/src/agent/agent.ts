import { AppEnv } from "@autumn/shared";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import {
	createAutumnMcpClient,
	getAutumnMcpTools,
} from "./mcp.js";
import { env as chatEnv } from "../lib/env.js";
import type { ChatContextMessage } from "../types.js";

const docs = [
	"autumn://docs/tool-composition",
	"autumn://docs/querying-plans",
	"autumn://docs/querying-customers",
	"autumn://docs/schedules",
	"autumn://docs/balances",
	"autumn://docs/billing-safety",
];

const instructions = `You are Autumn Chat.
Use Autumn MCP tools for customer, plan, balance, schedule, and billing work.
Preview billing-impacting changes first, summarize the preview in short Slack-friendly bullets, then call the matching write tool with the same request args.
The runtime pauses destructive tools for approval before execution, so do not ask for confirmation in plain text.`;

const envSelectionSchema = z.strictObject({
	env: z.nativeEnum(AppEnv),
});

const recentMessageContext = (messages: ChatContextMessage[] = []) =>
	messages.map((message) => ({
		role: message.isBot === true ? ("assistant" as const) : ("user" as const),
		content: `${message.author}${message.isBot === true ? " (bot)" : ""}: ${message.text}`,
	}));

export const selectChatEnv = async ({
	message,
	recentMessages,
	select,
}: {
	message: string;
	recentMessages?: ChatContextMessage[];
	select?: () => Promise<unknown> | unknown;
}) => {
	if (select) return envSelectionSchema.parse(await select()).env;

	const agent = new Agent({
		id: "autumn-chat-env",
		name: "Autumn Chat Env",
		instructions:
			"Choose the Autumn environment for the latest user request. Default to live. Use sandbox only when the user clearly intends sandbox or test-mode usage.",
		model: chatEnv.CHAT_MODEL,
	});
	const output = await agent.generate(message, {
		maxSteps: 1,
		structuredOutput: {
			schema: envSelectionSchema,
			instructions:
				"Return live unless the latest user request clearly asks to use sandbox or test mode.",
		},
		context: [
			...recentMessageContext(recentMessages),
		],
	});
	return output.object.env;
};

const readDocs = async (mcp: ReturnType<typeof createAutumnMcpClient>) => {
	const resources = await Promise.allSettled(
		docs.map((uri) => mcp.resources.read("autumn", uri)),
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
	apiKey,
	env,
	message,
	threadId,
	resourceId,
	onAction,
	provider,
	recentMessages,
}: {
	apiKey: string;
	env: AppEnv;
	message: string;
	onAction?: (message: string) => Promise<void> | void;
	threadId: string;
	resourceId: string;
	provider: string;
	recentMessages?: ChatContextMessage[];
}) => {
	const mcp = createAutumnMcpClient(apiKey, { requireApproval: true });
	let previewApproval:
		| {
				toolName: string;
				toolArgs: Record<string, unknown>;
				preview: unknown;
		  }
		| undefined;
	try {
		await onAction?.("Loading Autumn tools and guidance");
		const [tools, docsText] = await Promise.all([
			getAutumnMcpTools(mcp, {
				applyApprovalPolicy: true,
				onToolCall: onAction,
				onPreview: (approval) => {
					previewApproval = approval;
				},
			}),
			readDocs(mcp),
		]);
		await onAction?.("Reasoning over the request");
		const agent = new Agent({
			id: "autumn-chat",
			name: "Autumn Chat",
			instructions: `${instructions}\n\nCurrent Autumn environment: ${env}.\n\n${docsText}`,
			model: chatEnv.CHAT_MODEL,
			tools,
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
		return { ...output, env, previewApproval };
	} finally {
		await mcp.disconnect();
	}
};
