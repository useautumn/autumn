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

export const proGrowthGoldenConfig =
	(): string => `import { feature, plan, item } from "atmn";

export const aiMessages = feature({
	id: "ai_messages",
	name: "AI Messages",
	type: "metered",
	consumable: true,
});

export const sso = feature({
	id: "sso",
	name: "SSO",
	type: "boolean",
});

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: { amount: 20, interval: "month" },
	items: [
		item({
			featureId: aiMessages.id,
			included: 500,
			reset: { interval: "month" },
		}),
	],
});

export const growth = plan({
	id: "growth",
	name: "Growth",
	price: { amount: 50, interval: "month" },
	items: [
		item({
			featureId: aiMessages.id,
			included: 2000,
			reset: { interval: "month" },
		}),
		item({ featureId: sso.id }),
	],
});
`;
