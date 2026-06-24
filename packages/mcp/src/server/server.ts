import { withAgentDocResources } from "@autumn/agent-docs/mcp";
import { MCPServer } from "@mastra/mcp";
import { autumnMcpResources } from "../resources/index.js";
import { autumnMcpInstructions } from "../resources-v2/mcpInstructions.js";
import { createRawAutumnOperationTools } from "../tools/index.js";

export const createAutumnOperationsMCPServer = () =>
	new MCPServer({
		id: "autumn-mcp",
		name: "Autumn MCP",
		version: "0.0.1",
		description: "Operate on Autumn customers, plans, and billing.",
		instructions: autumnMcpInstructions,
		tools: createRawAutumnOperationTools(),
		resources: withAgentDocResources(autumnMcpResources),
	});
