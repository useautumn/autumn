import { defineConfig } from "./src/config/define.js";

/**
 * The single place to declare what docs content becomes agent-facing, and in
 * which formats. Humans edit this file + the composition mdx under content/;
 * src/ is machinery.
 *
 * - mcp:   resource = its `sources` concatenated as normal.
 * - skill: composed from a `content/` mdx (frontmatter + framing + insert tags).
 */
export default defineConfig({
	concepts: {
		title: "Concepts",
		description: "Autumn billing ontology and object relationships.",
		formats: {
			mcp: {
				uri: "concepts",
				priority: 0.95,
				document: "skills/concepts/concepts.mdx",
			},
			skill: { file: "skills/concepts/concepts.mdx" },
		},
	},
	catalog: {
		title: "Catalog",
		description:
			"Designing Autumn pricing models — features, plans, plan items.",
		formats: {
			mcp: {
				uri: "catalog",
				priority: 0.945,
				document: "skills/catalog/catalog.mdx",
			},
			skill: { file: "skills/catalog/catalog.mdx" },
		},
	},
	billing: {
		title: "Billing",
		description: "How agents should perform Autumn billing workflows.",
		formats: {
			mcp: {
				uri: "billing",
				priority: 0.94,
				document: "skills/billing/billing.mdx",
			},
			skill: { file: "skills/billing/billing.mdx" },
		},
	},
	investigate: {
		title: "Logs",
		description:
			"How agents should investigate Autumn API request logs and Stripe webhook deliveries.",
		formats: {
			mcp: {
				uri: "logs",
				priority: 0.93,
				document: "skills/investigate/investigate.mdx",
			},
			skill: { file: "skills/investigate/investigate.mdx" },
		},
	},
});
