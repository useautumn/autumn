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
			versionSlug: "v1",
			active: true,
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
			versionSlug: "v1",
			active: true,
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
			versionSlug: "v1",
			active: true,
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
