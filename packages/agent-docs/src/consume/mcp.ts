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

/**
 * Wrap an MCP server's base resources, overriding any whose `uri` matches an
 * agent-docs-generated resource and appending any that the base lacks. Other
 * base resources delegate unchanged.
 */
export const withAgentDocResources = (
	base: MCPServerResources,
): MCPServerResources => {
	const byUri = new Map(mcpResources.map((doc) => [doc.uri, doc]));

	return {
		listResources: async (extra) => {
			const baseList = await base.listResources(extra);
			const baseUris = new Set(baseList.map((resource) => resource.uri));
			const merged = baseList.map((resource) => {
				const doc = byUri.get(resource.uri);
				return doc ? toListItem(doc) : resource;
			});
			const additions = mcpResources
				.filter((doc) => !baseUris.has(doc.uri))
				.map(toListItem);
			return [...merged, ...additions];
		},
		getResourceContent: async (args) => {
			const doc = byUri.get(args.uri);
			if (doc) {
				return { text: doc.text };
			}
			return base.getResourceContent(args);
		},
	};
};
