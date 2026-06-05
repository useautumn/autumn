import { isSecretKeyPrefix } from "@autumn/auth";
import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import { MCPClient } from "@mastra/mcp";
import { env } from "../lib/env.js";
import { logger as rootLogger } from "../lib/logger.js";
import { getWriteToolForPreview, toolLabel } from "./toolPolicy.js";

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
	onPreview?: (approval: {
		toolName: string;
		toolArgs: Record<string, unknown>;
		preview: unknown;
	}) => void;
};

const withAuthFetch =
	({ appEnv, token }: { appEnv: AppEnv; token: string }) =>
	(input: RequestInfo | URL, init?: RequestInit) => {
		const headers = new Headers(init?.headers);
		headers.set("Authorization", `Bearer ${token}`);
		headers.set("x-autumn-environment", appEnv);
		if (isSecretKeyPrefix({ token })) {
			headers.set("secret-key", token);
		}
		return fetch(input, { ...init, headers });
	};

export const createAutumnMcpClient = ({
	token,
	appEnv,
	options = {},
}: {
	token: string;
	appEnv: AppEnv;
	options?: { requireApproval?: boolean };
}) => {
	const fetchWithAuth = withAuthFetch({ appEnv, token });
	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`,
		"x-autumn-environment": appEnv,
	};
	if (isSecretKeyPrefix({ token })) {
		headers["secret-key"] = token;
	}

	return new MCPClient({
		id: `autumn-${token.slice(0, 14)}`,
		servers: {
			autumn: {
				url: new URL("/mcp", env.MCP_SERVER_URL),
				requestInit: { headers },
				eventSourceInit: { fetch: fetchWithAuth },
				fetch: fetchWithAuth,
				requireToolApproval: options.requireApproval
					? ({ annotations }) => annotations?.destructiveHint === true
					: false,
			},
		},
	});
};

const formatToolAction = ({
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
		if (tool.execute && (options.onToolCall || options.onPreview)) {
			const execute = tool.execute.bind(tool);
			tool.execute = async (args, ...rest) => {
				logger.info("Calling Autumn MCP tool", {
					event: "leaf.mcp_tool_called",
					tool: toolName,
				});
				await options.onToolCall?.(formatToolAction({ toolName, args }));
				const result = await execute(args, ...rest);
				const writeTool = getWriteToolForPreview(toolName);
				if (writeTool) {
					logger.info("Captured Autumn MCP preview", {
						event: "leaf.mcp_preview_captured",
						tool: writeTool,
						data: {
							preview_tool: toolName,
						},
					});
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
	env,
	token,
	toolName,
	args,
}: {
	env: AppEnv;
	token: string;
	toolName: string;
	args: Record<string, unknown>;
}) => {
	const mcp = createAutumnMcpClient({ token, appEnv: env });
	try {
		const tools = await getAutumnMcpTools({ mcp });
		const tool = tools[toolName.replace(/^autumn_/, "")];
		if (!tool?.execute) throw new Error(`Unknown Autumn MCP tool: ${toolName}`);
		return await tool.execute(args);
	} finally {
		await mcp.disconnect();
	}
};
