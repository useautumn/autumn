import type { PlanSpec } from "../../../src/grading/types/planSpec.ts";

export const knowledgePlatformGoal =
	"Get your docs platform's pricing set up in Autumn without touching a dashboard.";

export const knowledgePlatformFacts = [
	"- Two paid plans: Pro at $180 a month, Growth at $500 a month.",
	"- Both have annual options: Pro $1,800 a year, Growth $5,000 a year.",
	"- Plans are bought per deployment — one customer can run several deployments, each on its own plan.",
	"- Every paid plan includes AI credits: Pro 5,000 a month, Growth 10,000 a month.",
	"- Included credits are shared across the whole org: every deployment's credits go into one shared pot that any deployment can draw from.",
	"- Credits reset monthly on every plan — annual plans still get their credits per month, not 60,000 up front.",
	"- AI assistant messages draw from credits, 1 credit per message.",
	"- Past the included credits, usage costs $0.01 per credit, billed at the end of the month.",
	"- Customers on any plan can also pay for extra credits on top: $100 a month gets 10,000 extra credits each month, $500 a month gets 55,000, $1,000 a month gets 120,000. The extra credits renew monthly and are shared across deployments like the rest. (You think of this as part of the product, not a separate thing — describe it vaguely unless pressed.)",
	"- No free plan, no trials.",
].join("\n");

export const knowledgePlatformUserFacts = [
	knowledgePlatformFacts,
	"- If asked what a plan/subscription is bought for or attached to: per deployment. If asked whether credits are shared or separate: shared org-wide.",
].join("\n");

export const pooledConclusionChecks = {
	"concluded plans attach per deployment":
		"Did the agent's final structure/summary state that plans are bought/attached per deployment (each deployment on its own plan), rather than one plan for the whole customer account?",
	"concluded credits pool org-wide":
		"Did the agent state that included credits are shared/pooled across all deployments into one org-wide balance (any phrasing), rather than each deployment keeping its own separate credits?",
} as const;

const overageItem = {
	price: { amount: 0.01, billing_method: "usage_based" },
};

export const proMonthlySpec: PlanSpec = {
	price: { amount: 180, interval: "month" },
	items: [
		{ included: 5000, pooled: true, reset: { interval: "month" } },
		overageItem,
	],
};

export const growthAnnualSpec: PlanSpec = {
	price: { amount: 5000, interval: "year" },
	items: [
		{ included: 10000, pooled: true, reset: { interval: "month" } },
		overageItem,
	],
};

export const proMonthlyNoPoolSpec: PlanSpec = {
	price: { amount: 180, interval: "month" },
	items: [
		{ included: 5000 },
		{
			price: { amount: 0.01, billing_method: "usage_based", interval: "month" },
		},
	],
};

export const growthAnnualNoPoolSpec: PlanSpec = {
	price: { amount: 5000, interval: "year" },
	items: [
		{ included: 10000 },
		{
			price: { amount: 0.01, billing_method: "usage_based", interval: "month" },
		},
	],
};

export const creditsPackAddOnSpec: PlanSpec = {
	add_on: true,
	items: [{}],
};

export const knowledgePlatformGoldenConfig = ({
	withPacks = true,
}: {
	withPacks?: boolean;
} = {}): string => `import { atmn, feature, plan } from "atmn";

export default atmn({
	features: [
		feature({
			featureId: "assistant_messages",
			name: "Assistant Messages",
			type: "metered",
			consumable: true,
		}),
		feature({
			featureId: "ai_credits",
			name: "AI Credits",
			type: "credit_system",
			creditSchema: [{ meteredFeatureId: "assistant_messages", creditCost: 1 }],
		}),
	],
	plans: [
		plan({
			planId: "pro",
			versionSlug: "v1",
			active: true,
			name: "Pro",
			price: { amount: 180, interval: "month" },
			items: [
				{
					featureId: "ai_credits",
					included: 5000,
					pooled: true,
					reset: { interval: "month" },
				},
				{
					featureId: "ai_credits",
					included: 0,
					price: {
						amount: 0.01,
						billingUnits: 1,
						billingMethod: "usage_based",
						interval: "month",
					},
				},
			],
		}),
		plan({
			planId: "pro_annual",
			versionSlug: "v1",
			active: true,
			name: "Pro (Annual)",
			price: { amount: 1800, interval: "year" },
			items: [
				{
					featureId: "ai_credits",
					included: 5000,
					pooled: true,
					reset: { interval: "month" },
				},
				{
					featureId: "ai_credits",
					included: 0,
					price: {
						amount: 0.01,
						billingUnits: 1,
						billingMethod: "usage_based",
						interval: "month",
					},
				},
			],
		}),
		plan({
			planId: "growth",
			versionSlug: "v1",
			active: true,
			name: "Growth",
			price: { amount: 500, interval: "month" },
			items: [
				{
					featureId: "ai_credits",
					included: 10000,
					pooled: true,
					reset: { interval: "month" },
				},
				{
					featureId: "ai_credits",
					included: 0,
					price: {
						amount: 0.01,
						billingUnits: 1,
						billingMethod: "usage_based",
						interval: "month",
					},
				},
			],
		}),
		plan({
			planId: "growth_annual",
			versionSlug: "v1",
			active: true,
			name: "Growth (Annual)",
			price: { amount: 5000, interval: "year" },
			items: [
				{
					featureId: "ai_credits",
					included: 10000,
					pooled: true,
					reset: { interval: "month" },
				},
				{
					featureId: "ai_credits",
					included: 0,
					price: {
						amount: 0.01,
						billingUnits: 1,
						billingMethod: "usage_based",
						interval: "month",
					},
				},
			],
		}),
${
	withPacks
		? `		plan({
			planId: "credits_pack",
			versionSlug: "v1",
			active: true,
			name: "Credits Pack",
			addOn: true,
			items: [
				{
					featureId: "ai_credits",
					included: 0,
					price: {
						tiers: [
							{ to: 10000, amount: 0, flatAmount: 100 },
							{ to: 55000, amount: 0, flatAmount: 500 },
							{ to: 120000, amount: 0, flatAmount: 1000 },
						],
						billingUnits: 1,
						billingMethod: "prepaid",
						tierBehavior: "volume",
						interval: "month",
					},
				},
			],
		}),
`
		: ""
}	],
});
`;
