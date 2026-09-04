import type { PlanSpec } from "../../../src/grading/types/planSpec.ts";

/**
 * Anonymized real-customer archetype: a knowledge-base/docs platform. Its
 * signature decisions — what this suite exists to test:
 *   ① plans attach per DEPLOYMENT but included credits are POOLED org-wide
 *     (`pooled: true` on the credit items)
 *   ② prepaid credit PACKS as one separate org-level attach-on-top add-on,
 *     never duplicated onto the base plans
 *   ③ annual plan twins whose credits still reset MONTHLY
 * Generic skills (trials, revision, write-from-structure) are tested in
 * basics/ on cheaper catalogs, not here.
 */

export const knowledgePlatformGoal =
	"Get your docs platform's pricing set up in Autumn without touching a dashboard.";

/** The full brief. B twins are manufactured by deleting exactly one line. */
export const knowledgePlatformFacts = [
	"- Two paid plans: Pro at $180 a month, Growth at $500 a month.",
	"- Both have annual options: Pro $1,800 a year, Growth $5,000 a year.",
	"- Plans are bought per deployment — one customer can run several deployments, each on its own plan.",
	"- Every paid plan includes AI credits: Pro 5,000 a month, Growth 10,000 a month.",
	"- Included credits are shared across the whole org: every deployment's credits go into one shared pot that any deployment can draw from.",
	"- Credits reset monthly on every plan — annual plans still get their credits per month, not 60,000 up front.",
	"- AI assistant messages draw from credits, 1 credit per message.",
	"- Past the included credits, usage costs $0.01 per credit, billed at the end of the month.",
	"- Customers on any plan can also pay for extra credits on top: $100 a month gets 10,000 extra credits each month, $500 a month gets 55,000, $1,000 a month gets 120,000. The extra credits renew monthly and are shared across deployments like the rest. (You think of this as part of the product, not a separate thing — describe it vaguely unless pressed.)",
	"- No free plan, no trials.",
].join("\n");

/** B twins delete a fact from the case's OPENING PROMPT only. The simulated
 * user always keeps the FULL brief — it must answer the surfaced question
 * with ground truth, not improvise. */
export const knowledgePlatformUserFacts = [
	knowledgePlatformFacts,
	// Attach and pooling are different questions — answer the one asked.
	"- If asked what a plan/subscription is bought for or attached to: per deployment. If asked whether credits are shared or separate: shared org-wide.",
].join("\n");

/** ①'s config-invisible half: pooling isn't writable in autumn.config.ts, so
 * the conclusion is graded on what the agent SAID. Shared by oneShot + twins. */
export const pooledConclusionChecks = {
	"concluded plans attach per deployment":
		"Did the agent's final structure/summary state that plans are bought/attached per deployment (each deployment on its own plan), rather than one plan for the whole customer account?",
	"concluded credits pool org-wide":
		"Did the agent state that included credits are shared/pooled across all deployments into one org-wide balance (any phrasing), rather than each deployment keeping its own separate credits?",
} as const;

/** Overage lives ON each base plan — that's what breaks usage down per
 * entity. An overage add-on plan instead is a graded wrong. */
const overageItem = {
	price: { amount: 0.01, billing_method: "usage_based" },
};

/** Spec anchors — one monthly and one annual twin carries the signal.
 * ① included credits are pooled into the shared org balance. */
export const proMonthlySpec: PlanSpec = {
	price: { amount: 180, interval: "month" },
	items: [
		{ included: 5000, pooled: true, reset: { interval: "month" } },
		overageItem,
	],
};

/** ③ the archetype's signature trap: annual price, MONTHLY credit reset. */
export const growthAnnualSpec: PlanSpec = {
	price: { amount: 5000, interval: "year" },
	items: [
		{ included: 10000, pooled: true, reset: { interval: "month" } },
		overageItem,
	],
};

/** Non-pooled twins for briefs that never mention deployments (the clear
 * negative control) — expecting `pooled` there would grade a fact the user
 * never stated. No explicit `reset` requirement either: a merged
 * grant+overage item resets via price.interval month, which the required
 * monthly usage price already pins. */
export const proMonthlyNoPoolSpec: PlanSpec = {
	price: { amount: 180, interval: "month" },
	items: [
		{ included: 5000 },
		{
			price: { amount: 0.01, billing_method: "usage_based", interval: "month" },
		},
	],
};

export const growthAnnualNoPoolSpec: PlanSpec = {
	price: { amount: 5000, interval: "year" },
	items: [
		{ included: 10000 },
		{
			price: { amount: 0.01, billing_method: "usage_based", interval: "month" },
		},
	],
};

/** ② the extra-credit purchase lives on a separate add-on, off the base
 * plans. Shape is the agent's choice — volume tiers on one prepaid item, or
 * a priced add-on with included credits and variants per size are both
 * valid — so the spec only pins the structural decision. */
export const creditsPackAddOnSpec: PlanSpec = {
	add_on: true,
	items: [{}],
};

/** withPacks=false gives the four base plans only — the seed for the packs
 * step case and the workspace the pack must be added to without nuking. */
export const knowledgePlatformGoldenConfig = ({
	withPacks = true,
}: {
	withPacks?: boolean;
} = {}): string => `import { feature, plan, item } from "atmn";

export const assistantMessages = feature({
	id: "assistant_messages",
	name: "Assistant Messages",
	type: "metered",
	consumable: true,
});

export const aiCredits = feature({
	id: "ai_credits",
	name: "AI Credits",
	type: "credit_system",
	creditSchema: [{ meteredFeatureId: "assistant_messages", creditCost: 1 }],
});

const includedCredits = (included: number) => [
	item({
		featureId: aiCredits.id,
		included,
		pooled: true,
		reset: { interval: "month" },
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
];

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: { amount: 180, interval: "month" },
	items: includedCredits(5000),
});

export const proAnnual = plan({
	id: "pro_annual",
	name: "Pro (Annual)",
	price: { amount: 1800, interval: "year" },
	items: includedCredits(5000),
});

export const growth = plan({
	id: "growth",
	name: "Growth",
	price: { amount: 500, interval: "month" },
	items: includedCredits(10000),
});

export const growthAnnual = plan({
	id: "growth_annual",
	name: "Growth (Annual)",
	price: { amount: 5000, interval: "year" },
	items: includedCredits(10000),
});
${
	withPacks
		? `
export const creditsPack = plan({
	id: "credits_pack",
	name: "Credits Pack",
	addOn: true,
	items: [
		item({
			featureId: aiCredits.id,
			included: 0,
			price: {
				tiers: [
					{ to: 10000, amount: 0, flatAmount: 100 },
					{ to: 55000, amount: 0, flatAmount: 500 },
					{ to: 120000, amount: 0, flatAmount: 1000 },
				],
				billingUnits: 1,
				billingMethod: "prepaid",
				tierBehavior: "volume",
				interval: "month",
			},
		}),
	],
});
`
		: ""
}`;
