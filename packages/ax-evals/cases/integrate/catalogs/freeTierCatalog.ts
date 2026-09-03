/**
 * Minimal free-tier catalog for gating/metering flow cases: one metered
 * feature, one auto-enable free plan with a small monthly allowance.
 */
export const freeTierCatalog = `import { feature, plan, item } from "atmn";

export const summaries = feature({
	id: "summaries",
	name: "Summaries",
	type: "metered",
	consumable: true,
});

export const free = plan({
	id: "free",
	name: "Free",
	autoEnable: true,
	items: [
		item({
			featureId: summaries.id,
			included: 3,
			reset: { interval: "month" },
		}),
	],
});
`;
