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
					legacy("intro.md"),
					legacy("feature.md"),
					legacy("plan.md"),
					docs("documentation/concepts/plan-items.mdx"),
					legacy("trials.md"),
					legacy("customer-entity.md"),
					legacy("billing-controls.md"),
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
});
