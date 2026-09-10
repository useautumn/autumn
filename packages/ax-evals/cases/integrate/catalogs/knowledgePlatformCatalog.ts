/**
 * Knowledge-platform archetype catalog (Minify-like), for flow cases that
 * need: a DEFAULT trial plan (autoEnable + no-card free trial), paid monthly
 * and annual twins, and a metered credit feature. Pushed to the case's org
 * before the agent starts.
 */
export const knowledgePlatformCatalog = `import { atmn, feature, plan } from "atmn";

export default atmn({
	features: [
		feature({
			featureId: "ai_credits",
			name: "AI Credits",
			type: "metered",
			consumable: true,
		}),
	],
	plans: [
		plan({
			planId: "pro_trial",
			name: "Pro Trial",
			autoEnable: true,
			freeTrial: { durationLength: 14, durationType: "day", cardRequired: false },
			items: [
				{
					featureId: "ai_credits",
					included: 500,
					reset: { interval: "month" },
				},
			],
		}),
		plan({
			planId: "pro",
			name: "Pro",
			price: { amount: 180, interval: "month" },
			items: [
				{
					featureId: "ai_credits",
					included: 5000,
					reset: { interval: "month" },
				},
			],
		}),
		plan({
			planId: "pro_annual",
			name: "Pro (Annual)",
			price: { amount: 1800, interval: "year" },
			items: [
				{
					featureId: "ai_credits",
					included: 5000,
					reset: { interval: "month" },
				},
			],
		}),
	],
});
`;
