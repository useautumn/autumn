import type { MCPServerResources } from "@mastra/mcp";
import { compileResourceFiles } from "./compileResources.js";

const resourceFiles = [
	"./general/tool-composition.md",
	"./features/feature-catalog.md",
	"./plans/querying-plans.md",
	"./plans/creating-plans.md",
	"./customers/querying-customers.md",
	"./billing/billing-safety.md",
	"./billing/schedules.md",
	"./balances/standalone-balances.md",
	"./logs/request-logs.md",
	"./logs/customers.md",
	"./logs/balances.md",
	"./logs/billing.md",
	"./logs/stripe-webhooks.md",
	"./logs/analytics.md",
] as const;

const docs = compileResourceFiles({
	baseUrl: import.meta.url,
	files: resourceFiles,
});

const docByUri = new Map(docs.map((doc) => [doc.uri, doc]));

export const autumnMcpResources: MCPServerResources = {
	listResources: async () =>
		docs.map((doc) => ({
			uri: doc.uri,
			name: doc.name,
			title: doc.title,
			description: doc.description,
			mimeType: "text/markdown",
			size: doc.text.length,
			annotations: {
				audience: doc.audience,
				priority: doc.priority,
			},
		})),
	getResourceContent: async ({ uri }) => {
		const doc = docByUri.get(uri);
		if (!doc) {
			throw new Error(`Unknown Autumn MCP resource: ${uri}`);
		}
		return { text: doc.text };
	},
};

export const autumnMcpResourceUris = docs.map((doc) => doc.uri);
