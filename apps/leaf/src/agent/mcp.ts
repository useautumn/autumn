import { MCPClient } from "@mastra/mcp";
import { getWriteToolForPreview, toolLabel } from "./toolPolicy.js";
import { env } from "../lib/env.js";

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
	onToolCall?: (message: string) => Promise<void> | void;
	onPreview?: (approval: {
		toolName: string;
		toolArgs: Record<string, unknown>;
		preview: unknown;
	}) => void;
};

const withAuthFetch =
	(apiKey: string) => (input: RequestInfo | URL, init?: RequestInit) => {
		const headers = new Headers(init?.headers);
		headers.set("Authorization", `Bearer ${apiKey}`);
		headers.set("secret-key", apiKey);
		return fetch(input, { ...init, headers });
	};

export const createAutumnMcpClient = (
	apiKey: string,
	options: { requireApproval?: boolean } = {},
) => {
	const fetchWithAuth = withAuthFetch(apiKey);
	return new MCPClient({
		id: `autumn-${apiKey.slice(0, 14)}`,
		servers: {
			autumn: {
				url: new URL(env.AUTUMN_MCP_URL),
				requestInit: {
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"secret-key": apiKey,
					},
				},
				eventSourceInit: { fetch: fetchWithAuth },
				fetch: fetchWithAuth,
				requireToolApproval: options.requireApproval
					? ({ annotations }) => annotations?.destructiveHint === true
					: false,
			},
		},
	});
};

const formatToolAction = (toolName: string, args: Record<string, unknown>) => {
	const request =
		args.request && typeof args.request === "object"
			? (args.request as Record<string, unknown>)
			: args;
	const details = [
		["customer", request.customer_id],
		["plan", request.plan_id],
		["entity", request.entity_id],
		["search", request.search],
	].flatMap(([label, value]) =>
		typeof value === "string" && value ? [`${label}: ${value}`] : [],
	);

	return `${toolLabel(toolName)}${details.length ? ` (${details.join(", ")})` : ""}`;
};

export const getAutumnMcpTools = async (
	mcp: MCPClient,
	options: ToolOptions = {},
) => {
	const { toolsets, errors } = await mcp.listToolsetsWithErrors();
	if (Object.keys(errors).length) {
		throw new Error(`Could not load Autumn MCP tools: ${JSON.stringify(errors)}`);
	}

	const tools = (toolsets.autumn ?? {}) as Record<string, AutumnTool>;
	for (const [toolName, tool] of Object.entries(tools)) {
		if (options.applyApprovalPolicy) {
			tool.requireApproval = tool.mcp?.annotations?.destructiveHint === true;
			if (!tool.requireApproval) tool.needsApprovalFn = undefined;
		}
		if (tool.execute && (options.onToolCall || options.onPreview)) {
			const execute = tool.execute.bind(tool);
			tool.execute = async (args, ...rest) => {
				await options.onToolCall?.(formatToolAction(toolName, args));
				const result = await execute(args, ...rest);
				const writeTool = getWriteToolForPreview(toolName);
				if (writeTool) {
					options.onPreview?.({
						toolName: writeTool,
						toolArgs: args,
						preview: result,
					});
				}
				return result;
			};
		}
	}
	return tools;
};

export const executeAutumnMcpTool = async ({
	apiKey,
	toolName,
	args,
}: {
	apiKey: string;
	toolName: string;
	args: Record<string, unknown>;
}) => {
	const mcp = createAutumnMcpClient(apiKey);
	try {
		const tools = await getAutumnMcpTools(mcp);
		const tool = tools[toolName.replace(/^autumn_/, "")];
		if (!tool?.execute) throw new Error(`Unknown Autumn MCP tool: ${toolName}`);
		return await tool.execute(args);
	} finally {
		await mcp.disconnect();
	}
};
