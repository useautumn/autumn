import { autumnMcpInstructions } from "@autumn/agent-docs/agent";
import { withAgentDocResources } from "@autumn/agent-docs/mcp";
import { MCPServer } from "@mastra/mcp";
import { AUTUMN_MCP_VERSION } from "../constants.js";
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
		version: AUTUMN_MCP_VERSION,
		description: "Operate on Autumn customers, plans, and billing.",
		instructions: autumnMcpInstructions,
		tools: createRawAutumnOperationTools({ requireIntent }),
		resources: withAgentDocResources(autumnMcpResources),
	});
