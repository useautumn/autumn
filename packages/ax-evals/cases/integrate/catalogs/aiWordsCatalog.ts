/**
 * Word-billed catalog for cost-aware gating cases: one metered consumable
 * feature whose unit is a word of processed text, and one auto-enable free
 * plan with a 1,000-word monthly allowance.
 */
export const aiWordsCatalog = `import { feature, plan, item } from "atmn";

export const words = feature({
	id: "words",
	name: "Words",
	type: "metered",
	consumable: true,
});

export const free = plan({
	id: "free",
	name: "Free",
	autoEnable: true,
	items: [
		item({
			featureId: words.id,
			included: 1000,
			reset: { interval: "month" },
		}),
	],
});
`;
