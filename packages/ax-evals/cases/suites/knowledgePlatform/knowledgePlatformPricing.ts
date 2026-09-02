import type { PlanSpec } from "../../../src/grading/types/planSpec.ts";

/**
 * Anonymized real-customer archetype: a knowledge-base platform. Plans come in
 * monthly + annual pairs, every plan grants monthly AI credits, plans attach
 * per deployment (entity), and credits are sold as prepaid packages with a
 * usage-priced overage once they run out.
 */

/** Shared spec anchors — one monthly and one annual plan is enough signal;
 * nuking or mismodeling kills all four at once. */
export const proMonthlySpec: PlanSpec = {
	price: { amount: 150, interval: "month" },
	items: [{ included: 5000, reset: { interval: "month" } }],
};

/** Annual plan whose credits still reset monthly — the modeling detail that
 * separates "read the requirements" from "pattern-matched the price". */
export const growthAnnualSpec: PlanSpec = {
	price: { amount: 5000, interval: "year" },
	items: [{ included: 5000, reset: { interval: "month" } }],
};

export const creditsAddOnSpec: PlanSpec = {
	add_on: true,
	items: [
		{
			price: {
				billing_method: "prepaid",
				tier_behavior: "volume",
				tiers: [
					{ to: 1000, flat_amount: 100 },
					{ to: 10000, flat_amount: 1000 },
				],
			},
		},
	],
};

/** Placement-agnostic: overage may live on the add-on or on each base plan —
 * both are accepted modelings. */
export const overageAnywhereSpec: PlanSpec = {
	items: [
		{
			price: { amount: 0.01, interval: "month", billing_method: "usage_based" },
		},
	],
};

/** Known-correct config for grader proofs and for seeding conduct cases.
 * withCreditsAddOn=false gives just the four base plans. */
export const knowledgePlatformConfig = ({
	withCreditsAddOn = true,
}: {
	withCreditsAddOn?: boolean;
} = {}): string => `import { feature, plan, item } from "atmn";

export const aiCredits = feature({
	id: "ai_credits",
	name: "AI Credits",
	type: "metered",
	consumable: true,
});

const includedCredits = () =>
	item({
		featureId: aiCredits.id,
		included: 5000,
		reset: { interval: "month" },
	});

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: { amount: 150, interval: "month" },
	items: [includedCredits()],
});

export const proAnnual = plan({
	id: "pro_annual",
	name: "Pro (Annual)",
	price: { amount: 1500, interval: "year" },
	items: [includedCredits()],
});

export const growth = plan({
	id: "growth",
	name: "Growth",
	price: { amount: 500, interval: "month" },
	items: [includedCredits()],
});

export const growthAnnual = plan({
	id: "growth_annual",
	name: "Growth (Annual)",
	price: { amount: 5000, interval: "year" },
	items: [includedCredits()],
});
${
	withCreditsAddOn
		? `
export const creditsAddOn = plan({
	id: "credits_add_on",
	name: "Credits Add-on",
	addOn: true,
	items: [
		item({
			featureId: aiCredits.id,
			included: 0,
			price: {
				tiers: [
					{ to: 1000, amount: 0, flatAmount: 100 },
					{ to: 2000, amount: 0, flatAmount: 200 },
					{ to: 5000, amount: 0, flatAmount: 500 },
					{ to: 10000, amount: 0, flatAmount: 1000 },
				],
				billingUnits: 1,
				billingMethod: "prepaid",
				tierBehavior: "volume",
				interval: "month",
			},
		}),
		item({
			featureId: aiCredits.id,
			included: 0,
			price: {
				amount: 0.01,
				billingUnits: 1,
				billingMethod: "usage_based",
				interval: "month",
			},
		}),
	],
});
`
		: ""
}`;
