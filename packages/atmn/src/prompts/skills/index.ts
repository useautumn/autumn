// Skills are YAML-frontmatter markdown files that follow the SKILLS standard
// for AI coding assistants (Claude, Cursor, OpenCode, etc.)

import autumnCreatingCustomersContent from "./autumn-creating-customers.js";
import autumnAcceptingPaymentsContent from "./autumn-accepting-payments.js";
import autumnModellingPricingPlansContent from "./autumn-modelling-pricing-plans.js";
import autumnTrackingMeteredUsageContent from "./autumn-tracking-metered-usage.js";

export interface Skill {
	id: string;
	name: string;
	description: string;
	content: string;
}

export const skills: Skill[] = [
	{
		id: "autumn-creating-customers",
		name: "Creating Customers",
		description: "Set up Autumn billing integration",
		content: autumnCreatingCustomersContent,
	},
	{
		id: "autumn-accepting-payments",
		name: "Accepting Payments",
		description: "Add checkout, plan changes, and billing UI",
		content: autumnAcceptingPaymentsContent,
	},
	{
		id: "autumn-modelling-pricing-plans",
		name: "Modelling Pricing Plans",
		description: "Design pricing models with autumn.config.ts",
		content: autumnModellingPricingPlansContent,
	},
	{
		id: "autumn-tracking-metered-usage",
		name: "Tracking Metered Usage",
		description: "Add usage tracking and feature gating",
		content: autumnTrackingMeteredUsageContent,
	},
];

export { autumnCreatingCustomersContent, autumnAcceptingPaymentsContent, autumnModellingPricingPlansContent, autumnTrackingMeteredUsageContent };
