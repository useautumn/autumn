import { readFileSync } from "node:fs";
import type { MCPServerResources } from "@mastra/mcp";
import { parseResourceMarkdown } from "../resources/compileResources.js";
import type { AutumnMcpResourceDoc } from "../resources/types.js";

const billingResource = {
	name: "billing",
	title: "Billing",
	description: "How agents should perform Autumn billing workflows.",
	priority: 0.94,
	audience: ["assistant"],
	file: "./billing/billing.md",
	parts: [
		{ marker: "<!-- Action selection -->", file: "./billing/actions.md" },
		{ marker: "<!-- Customizations -->", file: "./billing/customize.md" },
		{
			marker: "<!-- Timing and schedules -->",
			file: "./billing/timing-schedules.md",
		},
		{
			marker: "<!-- Billing behavior -->",
			file: "./billing/billing-behavior.md",
		},
	],
} as const;
const conceptResource = {
	name: "concepts",
	title: "Concepts",
	description: "Autumn billing ontology and object relationships.",
	priority: 0.95,
	audience: ["assistant"],
	parts: [
		"./concepts/intro.md",
		"./concepts/feature.md",
		"./concepts/plan.md",
		"./concepts/plan-item.md",
		"./concepts/trials.md",
		"./concepts/customer-entity.md",
		"./concepts/billing-controls.md",
	],
} as const;

const resourceOrder = [
	"autumn://docs/concepts",
	"autumn://docs/plan-management",
	"autumn://docs/billing",
] as const;

const planManagementResourceFile = "./plan-management/plan-management.md";

const readResourceFile = ({
	baseUrl,
	file,
}: {
	baseUrl: string | URL;
	file: string;
}) => readFileSync(new URL(file, baseUrl), "utf8").trim();

const compileMarkdownResource = ({
	baseUrl,
	file,
}: {
	baseUrl: string | URL;
	file: string;
}): AutumnMcpResourceDoc => {
	const parsed = parseResourceMarkdown({
		path: file,
		text: readResourceFile({ baseUrl, file }),
	});
	return {
		name: parsed.name,
		title: parsed.title,
		description: parsed.description,
		priority: parsed.priority,
		audience: parsed.audience,
		uri: `autumn://docs/${parsed.name}`,
		text: parsed.body,
	};
};

const compileMarkdownResourceWithParts = ({
	baseUrl,
	file,
	parts: partSpecs,
}: {
	baseUrl: string | URL;
	file: string;
	parts: readonly { marker: string; file: string }[];
}): AutumnMcpResourceDoc => {
	const parsed = parseResourceMarkdown({
		path: file,
		text: readResourceFile({ baseUrl, file }),
	});
	const text = partSpecs.reduce(
		(body, part) =>
			body.replace(part.marker, readResourceFile({ baseUrl, file: part.file })),
		parsed.body,
	);

	return {
		name: parsed.name,
		title: parsed.title,
		description: parsed.description,
		priority: parsed.priority,
		audience: parsed.audience,
		uri: `autumn://docs/${parsed.name}`,
		text,
	};
};

const compilePartialResource = ({
	baseUrl,
	description,
	files,
	name,
	priority,
	title,
}: {
	baseUrl: string | URL;
	description: string;
	files: readonly string[];
	name: string;
	priority: number;
	title: string;
}): AutumnMcpResourceDoc => ({
	name,
	title,
	description,
	priority,
	audience: ["assistant"],
	uri: `autumn://docs/${name}`,
	text: [
		`# ${title}`,
		files.map((file) => readResourceFile({ baseUrl, file })).join("\n\n"),
	].join("\n\n"),
});

const orderResources = (docs: AutumnMcpResourceDoc[]) =>
	[...docs].sort(
		(a, b) =>
			resourceOrder.indexOf(a.uri as (typeof resourceOrder)[number]) -
			resourceOrder.indexOf(b.uri as (typeof resourceOrder)[number]),
	);

const compileResources = ({
	baseUrl,
}: {
	baseUrl: string | URL;
}): AutumnMcpResourceDoc[] => {
	const concepts = compilePartialResource({
		baseUrl,
		description: conceptResource.description,
		files: conceptResource.parts,
		name: conceptResource.name,
		priority: conceptResource.priority,
		title: conceptResource.title,
	});
	const planManagement = compileMarkdownResource({
		baseUrl,
		file: planManagementResourceFile,
	});
	const billing = compileMarkdownResourceWithParts({
		baseUrl,
		file: billingResource.file,
		parts: billingResource.parts,
	});

	return orderResources([
		concepts,
		planManagement,
		billing,
	]);
};

export const createAutumnMcpResources = ({
	baseUrl,
}: {
	baseUrl: string | URL;
}): MCPServerResources => {
	let docs: AutumnMcpResourceDoc[] | undefined;
	// Re-read resource markdown from disk every call in dev so prompt edits take
	// effect without a restart; memoize in prod.
	const getDocs = () => {
		if (process.env.NODE_ENV !== "production") {
			return compileResources({ baseUrl });
		}
		docs ??= compileResources({ baseUrl });
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
	compileResources({ baseUrl: import.meta.url }).map((doc) => doc.uri);
