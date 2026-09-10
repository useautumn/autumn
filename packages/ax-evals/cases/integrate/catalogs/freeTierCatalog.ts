/**
 * Minimal free-tier catalog for gating/metering flow cases: one metered
 * feature, one auto-enable free plan with a small monthly allowance.
 */
export const freeTierCatalog = `import { atmn, feature, plan } from "atmn";

export default atmn({
	features: [
		feature({
			featureId: "summaries",
			name: "Summaries",
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
					featureId: "summaries",
					included: 3,
					reset: { interval: "month" },
				},
			],
		}),
	],
});
`;
