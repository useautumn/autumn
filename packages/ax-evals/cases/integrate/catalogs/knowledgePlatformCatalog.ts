/**
 * Knowledge-platform archetype catalog (Minify-like), for flow cases that
 * need: a DEFAULT trial plan (autoEnable + no-card free trial), paid monthly
 * and annual twins, and a metered credit feature. Pushed to the case's org
 * before the agent starts.
 */
export const knowledgePlatformCatalog = `import { feature, plan, item } from "atmn";

export const aiCredits = feature({
	id: "ai_credits",
	name: "AI Credits",
	type: "metered",
	consumable: true,
});

// Default plan: every new customer starts here automatically.
export const proTrial = plan({
	id: "pro_trial",
	name: "Pro Trial",
	autoEnable: true,
	freeTrial: { durationLength: 14, durationType: "day", cardRequired: false },
	items: [
		item({ featureId: aiCredits.id, included: 500, reset: { interval: "month" } }),
	],
});

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: { amount: 180, interval: "month" },
	items: [
		item({ featureId: aiCredits.id, included: 5000, reset: { interval: "month" } }),
	],
});

export const proAnnual = plan({
	id: "pro_annual",
	name: "Pro (Annual)",
	price: { amount: 1800, interval: "year" },
	items: [
		item({ featureId: aiCredits.id, included: 5000, reset: { interval: "month" } }),
	],
});
`;
