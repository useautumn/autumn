import type { PlanSpec } from "../../../src/grading/types/planSpec.ts";

/**
 * The pro/growth archetype: $20 and $50 monthly plans, metered AI messages
 * (500 / 2,000, monthly reset), SSO on growth only, no overage, no free plan
 * or trials. Cases withhold different parts of this from their opening
 * message; the simulated user knows all of it and answers when asked.
 */

export const proGrowthGoal =
	"Get Pro and Growth set up in Autumn with your AI-message limits, without touching a dashboard.";

export const proGrowthFacts = [
	"- Pro is $20 a month, Growth is $50 a month. Monthly billing only.",
	"- AI messages are limited: Pro gets 500 a month, Growth gets 2,000 a month.",
	"- Growth also comes with SSO, Pro doesn't.",
	"- No overage — hard limit when they run out.",
	"- No free plan and no trials for now.",
].join("\n");

export const proPlanSpec: PlanSpec = {
	price: { amount: 20, interval: "month" },
	items: [{ included: 500, reset: { interval: "month" } }],
};

export const growthPlanSpec: PlanSpec = {
	price: { amount: 50, interval: "month" },
	items: [{ included: 2000, reset: { interval: "month" } }],
};

export const proGrowthGoldenConfig = ({
	withFree = false,
}: {
	withFree?: boolean;
} = {}): string => `import { atmn, feature, plan } from "atmn";

export default atmn({
	features: [
		feature({
			featureId: "ai_messages",
			name: "AI Messages",
			type: "metered",
			consumable: true,
		}),
		feature({
			featureId: "sso",
			name: "SSO",
			type: "boolean",
		}),
	],
	plans: [
		plan({
			planId: "pro",
			name: "Pro",
			price: { amount: 20, interval: "month" },
			items: [
				{
					featureId: "ai_messages",
					included: 500,
					reset: { interval: "month" },
				},
			],
		}),
		plan({
			planId: "growth",
			name: "Growth",
			price: { amount: 50, interval: "month" },
			items: [
				{
					featureId: "ai_messages",
					included: 2000,
					reset: { interval: "month" },
				},
				{ featureId: "sso" },
			],
		}),
${
	withFree
		? `		plan({
			planId: "free",
			name: "Free",
			autoEnable: true,
			items: [
				{
					featureId: "ai_messages",
					included: 50,
					reset: { interval: "month" },
				},
			],
		}),
`
		: ""
}	],
});
`;
