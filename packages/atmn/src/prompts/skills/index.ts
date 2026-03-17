// Skills are YAML-frontmatter markdown files that follow the SKILLS standard
// for AI coding assistants (Claude, Cursor, OpenCode, etc.)

import autumnBillingPageContent from "./autumn-billing-page.js";
import autumnGatingContent from "./autumn-gating.js";
import autumnModellingPricingPlansContent from "./autumn-modelling-pricing-plans.js";
import autumnSetupContent from "./autumn-setup.js";

export interface Skill {
	id: string;
	name: string;
	description: string;
	content: string;
}

export const skills: Skill[] = [
	{
		id: "autumn-setup",
		name: "Setup and Payments",
		description: "Install SDK, create customers, and add payment flow",
		content: autumnSetupContent,
	},
	{
		id: "autumn-gating",
		name: "Checking and Tracking",
		description: "Add usage tracking and feature gating",
		content: autumnGatingContent,
	},
	{
		id: "autumn-billing-page",
		name: "Build Your Billing Page",
		description: "Display billing state, plan switching, and subscriptions",
		content: autumnBillingPageContent,
	},
	{
		id: "autumn-modelling-pricing-plans",
		name: "Modelling Pricing Plans",
		description: "Design pricing models with autumn.config.ts",
		content: autumnModellingPricingPlansContent,
	},
];

export {
	autumnSetupContent,
	autumnGatingContent,
	autumnBillingPageContent,
	autumnModellingPricingPlansContent,
};
