/**
 * Email-credits archetype catalog for billing-control cases: one metered
 * consumable feature with an included grant AND a usage-based overage price
 * on a paid plan — the shape where overage billing (and turning it off via
 * spend limits) actually means something.
 */
export const emailCreditsCatalog = `import { feature, plan, item } from "atmn";

export const emails = feature({
	id: "emails",
	name: "Email Credits",
	type: "metered",
	consumable: true,
});

export const growth = plan({
	id: "growth",
	name: "Growth",
	price: { amount: 49, interval: "month" },
	items: [
		item({
			featureId: emails.id,
			included: 500,
			reset: { interval: "month" },
			price: {
				amount: 0.02,
				billingUnits: 1,
				billingMethod: "usage_based",
				interval: "month",
			},
		}),
	],
});
`;
