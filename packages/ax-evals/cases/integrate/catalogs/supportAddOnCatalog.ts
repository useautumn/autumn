export const supportAddOnCatalog = `import { atmn, feature, plan } from "atmn";

export default atmn({
	features: [
		feature({
			featureId: "ai_credits",
			name: "AI Credits",
			type: "metered",
			consumable: true,
		}),
		feature({
			featureId: "priority_support",
			name: "Priority Support",
			type: "boolean",
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
					reset: { interval: "month" },
				},
			],
		}),
		plan({
			planId: "support_addon",
			versionSlug: "v1",
			active: true,
			name: "Priority Support Add-on",
			addOn: true,
			price: { amount: 50, interval: "month" },
			items: [{ featureId: "priority_support" }],
		}),
	],
});
`;
