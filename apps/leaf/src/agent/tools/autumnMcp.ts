import type { AutumnLogger } from "@autumn/logging";
import type { MCPClient } from "@mastra/mcp";
import {
	autumnMcpHeaders,
	createAutumnMcpClient,
	executeAutumnMcpTool,
} from "../../internal/autumnMcp/client.js";
import { logger as rootLogger } from "../../lib/logger.js";
import {
	type createPreviewCapture,
	getWriteToolForPreview,
	isSilentTool,
	toolGerund,
} from "./toolPolicy.js";

type AutumnTool = {
	execute?: (
		args: Record<string, unknown>,
		...rest: unknown[]
	) => Promise<unknown>;
	mcp?: { annotations?: { destructiveHint?: boolean } };
	requireApproval?: boolean;
	needsApprovalFn?: unknown;
};

type ToolOptions = {
	applyApprovalPolicy?: boolean;
	logger?: AutumnLogger;
	onToolCall?: (message: string) => Promise<void> | void;
	previewCapture?: ReturnType<typeof createPreviewCapture>;
};

export { autumnMcpHeaders, createAutumnMcpClient, executeAutumnMcpTool };

const stripMastraRuntimeArgs = (args: Record<string, unknown>) => {
	const { id: _id, user: _user, ...toolArgs } = args;
	return toolArgs;
};

export const formatToolAction = ({
	toolName,
	args,
}: {
	toolName: string;
	args: Record<string, unknown>;
}) => {
	const request =
		args.request && typeof args.request === "object"
			? (args.request as Record<string, unknown>)
			: args;
	// Only human-meaningful values — opaque ids (customer_id, entity_id) bloat
	// the progress line without telling the reader anything.
	const details = [
		["plan", request.plan_id],
		["search", request.search],
	].flatMap(([label, value]) =>
		typeof value === "string" && value ? [`${label}: ${value}`] : [],
	);

	return `${toolGerund(toolName)}${details.length ? ` (${details.join(", ")})` : ""}`;
};

export const getAutumnMcpTools = async ({
	mcp,
	options = {},
}: {
	mcp: MCPClient;
	options?: ToolOptions;
}) => {
	const logger = options.logger ?? rootLogger;
	const { toolsets, errors } = await mcp.listToolsetsWithErrors();
	if (Object.keys(errors).length) {
		logger.error("Could not load Autumn MCP tools", {
			event: "leaf.mcp_tools_load_failed",
			data: { errors },
		});
		throw new Error(
			`Could not load Autumn MCP tools: ${JSON.stringify(errors)}`,
		);
	}

	const tools = (toolsets.autumn ?? {}) as Record<string, AutumnTool>;
	logger.info("Loaded Autumn MCP tools", {
		event: "leaf.mcp_tools_loaded",
		data: {
			tool_count: Object.keys(tools).length,
		},
	});
	for (const [toolName, tool] of Object.entries(tools)) {
		if (options.applyApprovalPolicy) {
			tool.requireApproval = tool.mcp?.annotations?.destructiveHint === true;
			if (!tool.requireApproval) tool.needsApprovalFn = undefined;
		}
		if (tool.execute && (options.onToolCall || options.previewCapture)) {
			const execute = tool.execute.bind(tool);
			tool.execute = async (args, ...rest) => {
				const toolArgs = stripMastraRuntimeArgs(args);
				logger.info("Calling Autumn MCP tool", {
					event: "leaf.mcp_tool_called",
					tool: toolName,
				});
				if (!isSilentTool(toolName)) {
					await options.onToolCall?.(
						formatToolAction({ toolName, args: toolArgs }),
					);
				}
				const result = await execute(toolArgs, ...rest);
				if (getWriteToolForPreview(toolName)) {
					logger.info("Captured Autumn MCP preview", {
						event: "leaf.mcp_preview_captured",
						data: { preview_tool: toolName },
					});
					options.previewCapture?.captureFromExecution({
						args: toolArgs,
						preview: result,
						toolName,
					});
				}
				return result;
			};
		}
	}
	return tools;
};
