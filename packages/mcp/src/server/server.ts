import { autumnMcpInstructions } from "@autumn/agent-docs/agent";
import { withAgentDocResources } from "@autumn/agent-docs/mcp";
import { MCPServer } from "@mastra/mcp";
import { autumnMcpResources } from "../resources/index.js";
import { createRawAutumnOperationTools } from "../tools/index.js";

export const createAutumnOperationsMCPServer = ({
	requireIntent = true,
}: {
	requireIntent?: boolean;
} = {}) =>
	new MCPServer({
		id: "autumn-mcp",
		name: "Autumn MCP",
		version: "0.0.1",
		description: "Operate on Autumn customers, plans, and billing.",
		instructions: autumnMcpInstructions,
		tools: createRawAutumnOperationTools({ requireIntent }),
		resources: withAgentDocResources(autumnMcpResources),
	});
