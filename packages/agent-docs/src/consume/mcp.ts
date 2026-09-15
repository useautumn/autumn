import type { MCPServerResources } from "@mastra/mcp";
import { mcpResources } from "../generated/mcp-resources.generated.js";
import type { McpResource } from "../translate/formats/types.js";

export { mcpResources };

const toListItem = (doc: McpResource) => ({
	uri: doc.uri,
	name: doc.name,
	title: doc.title,
	description: doc.description,
	mimeType: "text/markdown",
	size: doc.text.length,
	annotations: { audience: doc.audience, priority: doc.priority },
});

const byUri = new Map(mcpResources.map((doc) => [doc.uri, doc]));

/** The generated agent-docs resources, ready to hand to an MCP server. */
export const agentDocResources: MCPServerResources = {
	listResources: async () => mcpResources.map(toListItem),
	getResourceContent: async ({ uri }) => {
		const doc = byUri.get(uri);
		if (!doc) throw new Error(`Unknown resource ${uri}`);
		return { text: doc.text };
	},
};
