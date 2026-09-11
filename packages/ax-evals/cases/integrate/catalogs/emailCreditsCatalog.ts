/**
 * Email-credits archetype catalog for billing-control cases: one metered
 * consumable feature with an included grant AND a usage-based overage price
 * on a paid plan — the shape where overage billing (and turning it off via
 * spend limits) actually means something.
 */
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
