import { defineConfig } from "./src/config/define.js";
import type { AgentDefinition } from "./src/config/types.js";

/**
 * The Eve agents: each gets a composed prompt from its instructions mdx, and a
 * skill bundle resolved from the entry keys below. `leaf` is the only live one;
 * `catalog` is prepared but wired to no agent (see apps/leaf/agent/lib).
 */
export const agents = {
	leaf: {
		instructions: "instructions/leaf.md",
		skills: [
			"billingSteps",
			"investigate",
			"concepts",
			"trials",
			"schedules",
			"balances",
		],
	},
	catalog: {
		instructions: "instructions/subagents/catalog.md",
		skills: ["catalog"],
	},
} satisfies Record<string, AgentDefinition>;

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
	setup: {
		title: "Setup",
		description:
			"First-run Autumn setup — install the skill pack, then model pricing.",
		formats: {
			skill: { file: "skills/setup/setup.mdx" },
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
		},
	},
	billingSteps: {
		title: "Billing steps",
		description:
			"The step-by-step flow for updating a customer's billing state.",
		formats: {
			skill: { file: "skills/billing-steps/billing-steps.mdx" },
		},
	},
	trials: {
		title: "Trials",
		description:
			"Free trials: duration, card requirements, and end-of-trial behavior.",
		formats: {
			skill: { file: "skills/trials/trials.mdx" },
		},
	},
	schedules: {
		title: "Schedules",
		description:
			"Multi-phase schedules: phase timing, plan scoping, and immediate-phase params.",
		formats: {
			skill: { file: "skills/schedules/schedules.mdx" },
		},
	},
	balances: {
		title: "Balances",
		description:
			"How balances behave at zero: caps, overage permission, and billing controls.",
		formats: {
			skill: { file: "skills/balances/balances.mdx" },
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
