/**
 * Word-billed catalog for cost-aware gating cases: one metered consumable
 * feature whose unit is a word of processed text, and one auto-enable free
 * plan with a 1,000-word monthly allowance.
 */
export const aiWordsCatalog = `import { atmn, feature, plan } from "atmn";

export default atmn({
	features: [
		feature({
			featureId: "words",
			name: "Words",
			type: "metered",
			consumable: true,
		}),
	],
	plans: [
		plan({
			planId: "free",
			name: "Free",
			autoEnable: true,
			items: [
				{
					featureId: "words",
					included: 1000,
					reset: { interval: "month" },
				},
			],
		}),
	],
});
`;
