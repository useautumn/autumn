import { MCPServer } from "@mastra/mcp";
import { createAskAutumnTool } from "./ask-autumn.js";
import type { AutumnMcpAuth } from "./auth.js";

export const createAutumnMastraMCPServer = (_opts?: {
	defaultAuth?: AutumnMcpAuth;
}) =>
	new MCPServer({
		id: "autumn-mcp",
		name: "Autumn MCP",
		version: "0.0.1",
		description: "Ask Autumn to safely operate on customers, plans, and billing.",
		instructions:
			"Use ask_autumn for all Autumn work. Billing writes require preview and explicit user confirmation.",
		tools: {
			ask_autumn: createAskAutumnTool(_opts?.defaultAuth),
		},
	});
