import { defineConfig, docs, legacy } from "./src/config/define.js";

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
				sources: [
					legacy("concepts/intro.md"),
					legacy("concepts/feature.md"),
					legacy("concepts/plan.md"),
					docs("documentation/concepts/plan-items.mdx"),
					legacy("concepts/trials.md"),
					legacy("concepts/customer-entity.md"),
					legacy("concepts/billing-controls.md"),
				],
			},
			skill: { file: "skills/concepts.mdx" },
		},
	},
	"modelling-pricing": {
		title: "Modelling Pricing",
		description: "Designing Autumn pricing models.",
		formats: {
			skill: { file: "skills/modelling-pricing.mdx" },
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
