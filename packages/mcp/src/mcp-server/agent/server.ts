import { MCPServer } from "@mastra/mcp";
import { createAskAutumnTool } from "./ask-autumn.js";
import type { AutumnMcpAuth } from "./auth.js";
import { createRawAutumnOperationTools } from "./tools.js";

export const createAskAutumnMCPServer = (_opts?: {
	defaultAuth?: AutumnMcpAuth;
}) =>
	new MCPServer({
		id: "autumn-internal-mcp",
		name: "Autumn Internal MCP",
		version: "0.0.1",
		description: "Ask Autumn to safely operate on customers, plans, and billing.",
		instructions:
			"Use ask_autumn for all Autumn work. Billing writes require preview and explicit user confirmation.",
		tools: {
			ask_autumn: createAskAutumnTool(_opts?.defaultAuth),
		},
	});

export const createAutumnOperationsMCPServer = () =>
	new MCPServer({
		id: "autumn-mcp",
		name: "Autumn MCP",
		version: "0.0.1",
		description: "Operate on Autumn customers, plans, and billing.",
		instructions:
			"Use preview tools before billing writes. Write tools are destructive and should only be called after explicit user confirmation.",
		tools: createRawAutumnOperationTools(),
	});

export const createAutumnMastraMCPServer = createAskAutumnMCPServer;
