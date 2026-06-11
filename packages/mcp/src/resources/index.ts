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

// Build the Autumn doc resources from markdown under `baseUrl`. Compilation is
// deferred to first access, so importing this module never reads files at load
// time — consumers that bundle to CJS (where `import.meta.url` is empty), like the
// leaf evals, would otherwise crash on import. Evals build with a runtime baseUrl.
export const createAutumnMcpResources = ({
	baseUrl,
}: {
	baseUrl: string | URL;
}): MCPServerResources => {
	let docs: ReturnType<typeof compileResourceFiles> | undefined;
	const getDocs = () => {
		docs ??= compileResourceFiles({ baseUrl, files: resourceFiles });
		return docs;
	};
	return {
		listResources: async () =>
			getDocs().map((doc) => ({
				uri: doc.uri,
				name: doc.name,
				title: doc.title,
				description: doc.description,
				mimeType: "text/markdown",
				size: doc.text.length,
				annotations: { audience: doc.audience, priority: doc.priority },
			})),
		getResourceContent: async ({ uri }) => {
			const doc = getDocs().find((entry) => entry.uri === uri);
			if (!doc) {
				throw new Error(`Unknown Autumn MCP resource: ${uri}`);
			}
			return { text: doc.text };
		},
	};
};

export const autumnMcpResources = createAutumnMcpResources({
	baseUrl: import.meta.url,
});

export const autumnMcpResourceUris = () =>
	compileResourceFiles({ baseUrl: import.meta.url, files: resourceFiles }).map(
		(doc) => doc.uri,
	);
