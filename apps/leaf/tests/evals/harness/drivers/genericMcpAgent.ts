import { Agent } from "@mastra/core/agent";
import type { MessageListItem } from "@mastra/core/agent/message-list";
import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { MCPClient } from "@mastra/mcp";
import { createRequestContext } from "../../../../../../packages/mcp/src/server/auth/auth.js";
import { createLeafTracingOptions } from "../../../../src/internal/observability/leafTracingOptions.js";
import { createMastraBraintrustObservability } from "../../../../src/providers/braintrust/index.js";
import {
	defaultGenericMcpAgentConfig,
	type GenericMcpAgentDriverConfig,
	genericMcpAgentInstructions,
} from "../configs/genericMcpAgentConfig.js";
import type {
	EvalAgentDriver,
	EvalDriverStartInput,
	EvalToolCall,
} from "./types.js";

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

const toEvalToolCall = (call: {
	args?: Record<string, unknown>;
	name: string;
}): EvalToolCall => ({
	args: call.args ?? {},
	name: call.name,
});

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
			const call = toEvalToolCall({ args, name });
			toolCalls.push(call);
			trace.event({ call, type: "tool_call" });
			return execute(args, ...rest);
		};
	}
};

export const createGenericMcpAgentDriver = ({
	maxSteps = defaultGenericMcpAgentConfig.maxSteps,
	model = defaultGenericMcpAgentConfig.model,
}: GenericMcpAgentDriverConfig = {}): EvalAgentDriver => ({
	name: "generic-mcp-agent",
	start: async ({ context, setup, today, trace }: EvalDriverStartInput) => {
		const mcpClient = new MCPClient({
			id: `leaf-eval-${crypto.randomUUID()}`,
			servers: {
				autumn: {
					requireToolApproval: ({ annotations }) =>
						annotations?.destructiveHint === true,
					url: context.mcpServer.url,
				},
			},
		});
		const { toolsets, errors } = await mcpClient.listToolsetsWithErrors();
		if (Object.keys(errors).length) {
			throw new Error(`MCP tool discovery failed: ${JSON.stringify(errors)}`);
		}

		const tools = toolsets.autumn ?? {};
		applyToolApprovalPolicy(tools);
		const toolCalls: EvalToolCall[] = [];
		instrumentToolCalls({ toolCalls, tools, trace });

		const agent = new Agent({
			id: "leaf-mcp-eval-agent",
			name: "Leaf MCP Eval Agent",
			description: "A generic agent using Autumn MCP tools.",
			instructions: genericMcpAgentInstructions,
			model,
			tools,
		});
		const mastra = new Mastra({
			agents: { eval: agent },
			logger: false,
			observability: createMastraBraintrustObservability(),
			storage: new InMemoryStore({ id: `leaf-eval-${crypto.randomUUID()}` }),
		});
		const evalAgent = mastra.getAgent("eval");
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
				env: context.auth.env,
				orgId: context.auth.orgId,
				setup: setup.tag,
				source: "eval",
			}),
		});

		const rememberApproval = (output: {
			finishReason?: string;
			runId?: string;
			suspendPayload?: { toolCallId?: string };
		}) => {
			pendingApproval =
				output.finishReason === "suspended" && output.runId
					? {
							runId: output.runId,
							toolCallId: output.suspendPayload?.toolCallId,
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
				await mcpClient.disconnect();
			},
			getToolCalls: () => [...toolCalls],
			hasPendingApproval: () => pendingApproval !== null,
			send: async (message, { maxSteps: stepLimit } = {}) => {
				messages.push({ content: message, role: "user" });
				const output = await evalAgent.generate(messages, options(stepLimit));
				messages = output.messages;
				rememberApproval(output);
				trace.event({ text: output.text ?? "", type: "agent_text" });
				return { text: output.text };
			},
		};
	},
});
