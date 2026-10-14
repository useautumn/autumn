export const emailCreditsCatalog = `import { atmn, feature, plan } from "atmn";

export default atmn({
	features: [
		feature({
			featureId: "emails",
			name: "Email Credits",
			type: "metered",
			consumable: true,
		}),
	],
	plans: [
		plan({
			planId: "growth",
			versionSlug: "v1",
			active: true,
			name: "Growth",
			price: { amount: 49, interval: "month" },
			items: [
				{
					featureId: "emails",
					included: 500,
					reset: { interval: "month" },
					price: {
						amount: 0.02,
						billingUnits: 1,
						billingMethod: "usage_based",
						interval: "month",
					},
				},
			],
		}),
	],
});
`;
