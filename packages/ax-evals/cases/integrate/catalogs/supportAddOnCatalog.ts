/**
 * Base-plan-plus-add-on catalog for multi-attach / multi-update flow cases:
 * a paid Pro plan with metered credits, and a Priority Support add-on
 * (addOn: true) whose lifecycle rides along with the base plan.
 */
export const supportAddOnCatalog = `import { feature, plan, item } from "atmn";

export const aiCredits = feature({
	id: "ai_credits",
	name: "AI Credits",
	type: "metered",
	consumable: true,
});

export const prioritySupport = feature({
	id: "priority_support",
	name: "Priority Support",
	type: "boolean",
});

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: { amount: 180, interval: "month" },
	items: [
		item({ featureId: aiCredits.id, included: 5000, reset: { interval: "month" } }),
	],
});

export const supportAddon = plan({
	id: "support_addon",
	name: "Priority Support Add-on",
	addOn: true,
	price: { amount: 50, interval: "month" },
	items: [item({ featureId: prioritySupport.id })],
});
`;
