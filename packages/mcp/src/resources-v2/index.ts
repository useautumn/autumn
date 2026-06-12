import { readFileSync } from "node:fs";
import type { MCPServerResources } from "@mastra/mcp";
import { parseResourceMarkdown } from "../resources/compileResources.js";
import type { AutumnMcpResourceDoc } from "../resources/types.js";

const billingResourceFile = "./billing/billing.md";
const billingConceptFiles = [
	"./concepts/feature.md",
	"./concepts/plan.md",
	"./concepts/plan-item.md",
	"./concepts/customer-entity.md",
	"./concepts/billing-controls.md",
] as const;

const readResourceFile = ({
	baseUrl,
	file,
}: {
	baseUrl: string | URL;
	file: string;
}) => readFileSync(new URL(file, baseUrl), "utf8").trim();

const compileBillingResource = ({
	baseUrl,
}: {
	baseUrl: string | URL;
}): AutumnMcpResourceDoc[] => {
	const parsed = parseResourceMarkdown({
		path: billingResourceFile,
		text: readResourceFile({ baseUrl, file: billingResourceFile }),
	});
	const concepts = billingConceptFiles.map((file) =>
		readResourceFile({ baseUrl, file }),
	);

	return [
		{
			name: parsed.name,
			title: parsed.title,
			description: parsed.description,
			priority: parsed.priority,
			audience: parsed.audience,
			uri: `autumn://docs/${parsed.name}`,
			text: [parsed.body, ...concepts].join("\n\n"),
		},
	];
};

export const createAutumnMcpResources = ({
	baseUrl,
}: {
	baseUrl: string | URL;
}): MCPServerResources => {
	let docs: AutumnMcpResourceDoc[] | undefined;
	const getDocs = () => {
		docs ??= compileBillingResource({ baseUrl });
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
	compileBillingResource({ baseUrl: import.meta.url }).map((doc) => doc.uri);
