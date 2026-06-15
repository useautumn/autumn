import { MCPServer } from "@mastra/mcp";
import { autumnMcpResources } from "../resources/index.js";
import { createRawAutumnOperationTools } from "../tools/index.js";

export const createAutumnOperationsMCPServer = () =>
	new MCPServer({
		id: "autumn-mcp",
		name: "Autumn MCP",
		version: "0.0.1",
		description: "Operate on Autumn customers, plans, and billing.",
		instructions: [
			"Before customer, billing, balance, entity, or plan work, call getAgentRules to read org-specific behavior.",
			"Use preview tools before billing writes.",
			"Write tools are destructive and should only be called after explicit user confirmation.",
		].join(" "),
		tools: createRawAutumnOperationTools(),
		resources: autumnMcpResources,
	});
