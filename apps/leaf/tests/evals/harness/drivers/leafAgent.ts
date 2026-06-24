import { AppEnv } from "@autumn/shared";
import type { ToolsInput } from "@mastra/core/agent";
import type { MessageListItem } from "@mastra/core/agent/message-list";
import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { MCPClient } from "@mastra/mcp";
import { agentDocBundleUris } from "@autumn/agent-docs/agent";
import { createRequestContext } from "../../../../../../packages/mcp/src/server/auth/auth.js";
import { createAutumnChatAgent } from "../../../../src/agent/runMessage/engines/autumnChatAgent.js";
import { createLeafTracingOptions } from "../../../../src/internal/observability/leafTracingOptions.js";
import { createMastraBraintrustObservability } from "../../../../src/providers/braintrust/index.js";
import { defaultGenericMcpAgentConfig } from "../configs/genericMcpAgentConfig.js";
import type {
	EvalAgentDriver,
	EvalDriverMessage,
	EvalDriverStartInput,
	EvalToolCall,
} from "./types.js";

type LeafAgentDriverConfig = {
	maxSteps?: number;
	model?: string;
};

type ToolWithApproval = {
	execute?: unknown;
	mcp?: { annotations?: { destructiveHint?: boolean } };
	needsApprovalFn?: unknown;
	requireApproval?: unknown;
};

const applyToolApprovalPolicy = (tools: Record<string, ToolWithApproval>) => {
	for (const tool of Object.values(tools)) {
		const requiresApproval = tool.mcp?.annotations?.destructiveHint === true;
		tool.requireApproval = requiresApproval;
		if (!requiresApproval) tool.needsApprovalFn = undefined;
	}
};

const instrumentToolCalls = ({
	tools,
	toolCalls,
	trace,
}: {
	tools: Record<string, ToolWithApproval>;
	toolCalls: EvalToolCall[];
	trace: EvalDriverStartInput["trace"];
}) => {
	for (const [name, tool] of Object.entries(tools)) {
		if (typeof tool.execute !== "function") continue;
		const execute = tool.execute.bind(tool) as (
			args: Record<string, unknown>,
			...rest: unknown[]
		) => Promise<unknown>;
		tool.execute = async (
			args: Record<string, unknown>,
			...rest: unknown[]
		) => {
			const call = { args, name };
			toolCalls.push(call);
			trace.event({ call, type: "tool_call" });
			return execute(args, ...rest);
		};
	}
};

const readDocs = async (mcpClient: MCPClient) => {
	const resources = await Promise.allSettled(
		agentDocBundleUris.map((uri) => mcpClient.resources.read("autumn", uri)),
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

const appendUserMessage = ({
	input,
	messages,
}: {
	input: EvalDriverMessage;
	messages: MessageListItem[];
}) => {
	if (typeof input === "string") {
		messages.push({ content: input, role: "user" });
		return;
	}
	messages.push(...(input as MessageListItem[]));
};

export const createLeafAgentDriver = ({
	maxSteps = defaultGenericMcpAgentConfig.maxSteps,
	model = defaultGenericMcpAgentConfig.model,
}: LeafAgentDriverConfig = {}): EvalAgentDriver => ({
	name: "leaf-agent",
	start: async ({ context, setup, today, trace }: EvalDriverStartInput) => {
		const mcpClient = new MCPClient({
			id: `leaf-agent-eval-${crypto.randomUUID()}`,
			servers: {
				autumn: {
					requireToolApproval: ({ annotations }) =>
						annotations?.destructiveHint === true,
					url: context.mcpServer.url,
				},
			},
		});
		const [{ toolsets, errors }, docsText] = await Promise.all([
			mcpClient.listToolsetsWithErrors(),
			readDocs(mcpClient),
		]);
		if (Object.keys(errors).length) {
			throw new Error(`MCP tool discovery failed: ${JSON.stringify(errors)}`);
		}

		const env = context.auth.env === AppEnv.Live ? AppEnv.Live : AppEnv.Sandbox;
		const tools = (toolsets.autumn ?? {}) as Record<string, ToolWithApproval>;
		applyToolApprovalPolicy(tools);
		const toolCalls: EvalToolCall[] = [];
		instrumentToolCalls({ toolCalls, tools, trace });

		const agent = createAutumnChatAgent({
			docsText,
			env,
			model,
			tools: tools as ToolsInput,
		});
		const mastra = new Mastra({
			agents: { chat: agent },
			logger: false,
			observability: createMastraBraintrustObservability(),
			storage: new InMemoryStore({
				id: `leaf-agent-eval-${crypto.randomUUID()}`,
			}),
		});
		const evalAgent = mastra.getAgent("chat");
		let messages: MessageListItem[] = [];
		let pendingApproval: { runId: string; toolCallId?: string } | null = null;

		const options = (stepLimit?: number) => ({
			context: today
				? [
						{
							content: `Current date: ${today.toISOString()}.`,
							role: "system" as const,
						},
					]
				: undefined,
			maxSteps: stepLimit ?? maxSteps,
			requestContext: createRequestContext(context.auth),
			tracingOptions: createLeafTracingOptions({
				env,
				orgId: context.auth.orgId,
				setup: setup.tag,
				source: "eval",
			}),
		});

		const rememberApproval = (output: {
			finishReason?: string;
			runId?: string;
			suspension?: { toolCallId?: string };
		}) => {
			pendingApproval =
				output.finishReason === "suspended" && output.runId
					? {
							runId: output.runId,
							toolCallId: output.suspension?.toolCallId,
						}
					: null;
			if (pendingApproval) trace.event({ type: "approval_pending" });
		};

		return {
			approve: async ({ maxSteps: stepLimit } = {}) => {
				if (!pendingApproval) {
					throw new Error("No pending approval to approve.");
				}
				trace.event({ type: "approval_approved" });
				const output = await evalAgent.approveToolCallGenerate({
					...options(stepLimit),
					runId: pendingApproval.runId,
					toolCallId: pendingApproval.toolCallId,
				});
				messages = output.messages;
				rememberApproval(output);
				trace.event({ text: output.text ?? "", type: "agent_text" });
				return { text: output.text };
			},
			cleanup: async () => {
				await mastra.shutdown();
				await mcpClient.disconnect();
			},
			getToolCalls: () => [...toolCalls],
			hasPendingApproval: () => pendingApproval !== null,
			send: async (message, { maxSteps: stepLimit } = {}) => {
				appendUserMessage({ input: message, messages });
				const output = await evalAgent.generate(messages, options(stepLimit));
				messages = output.messages;
				rememberApproval(output);
				trace.event({ text: output.text ?? "", type: "agent_text" });
				return { text: output.text };
			},
		};
	},
});

export type { LeafAgentDriverConfig };
