import type { PlanSpec } from "../../../src/grading/types/planSpec.ts";

/**
 * Anonymized real-customer archetype: a developer messaging API. Its
 * signature decisions — what this suite exists to test:
 *   ① two product LINES held simultaneously (API sends vs Campaigns) →
 *     plan groups, one free default per group
 *   ② volume ladder as PLAN-PER-TIER — bigger versions of Pro are sibling
 *     plans in the same group written as `.variant()` of Pro, not usage
 *     tiers, prepaid packs, or copy-pasted standalone plans
 *   ③ per-1,000 overage (billing_units trap: $0.80 per 1,000 ≠ $0.80 each)
 * Load-bearing anchors without dedicated cases: lifetime (non-resetting)
 * caps, a flat-priced add-on, free tier that hard-stops.
 */

export const messagingApiGoal =
	"Get your messaging API's two product lines set up in Autumn without touching a dashboard.";

/** The full brief. B twins are manufactured by deleting exactly one line. */
export const messagingApiFacts = [
	"- Two products: the sending API, and Campaigns (bulk sends to contact lists). Customers can be on a plan for each at the same time — API and Campaigns plans are independent of each other.",
	"- API line: a free plan with 3,000 messages a month, and Pro at $25 a month with 50,000 messages a month.",
	"- API overage on Pro: $0.80 per 1,000 messages past the included amount, billed at the end of the month. The free plan just stops.",
	"- Campaigns line: a free plan with up to 1,000 contacts, and Campaigns Pro at $40 a month with up to 5,000 contacts.",
	"- Contacts don't reset — it's just how many you can have stored.",
	"- Everyone starts on both free plans automatically.",
	"- SSO is a paid add-on at $150 a month, flat.",
	"- No trials.",
].join("\n");

/** B twins delete a fact from the case's OPENING PROMPT only. The simulated
 * user always keeps the FULL brief — it must answer the surfaced question
 * with ground truth (both lines held simultaneously), not improvise. */
export const messagingApiUserFacts = [
	messagingApiFacts,
	"- If asked how the API and Campaigns plans relate: they're independent — a customer can be on one plan of each at the same time; it's not one upgrade path.",
	"- If asked about overage on Campaigns/contacts: there is none — the contact caps are hard limits.",
].join("\n");

/** ③ the billing_units trap: "$0.80 per 1,000" must be amount 0.8 per 1,000
 * units — amount 0.8 per unit is an 800x overcharge. */
export const apiProSpec: PlanSpec = {
	price: { amount: 25, interval: "month" },
	items: [
		{
			included: 50000,
			reset: { interval: "month" },
			price: {
				amount: 0.8,
				billing_units: 1000,
				billing_method: "usage_based",
			},
		},
	],
};

export const apiFreeSpec: PlanSpec = {
	freePlan: true,
	auto_enable: true,
	items: [{ included: 3000, reset: { interval: "month" } }],
};

/** Lifetime cap: contacts never reset. */
export const campaignsFreeSpec: PlanSpec = {
	freePlan: true,
	auto_enable: true,
	items: [{ included: 1000 }],
};

export const campaignsProSpec: PlanSpec = {
	price: { amount: 40, interval: "month" },
	items: [{ included: 5000 }],
};

/** Flat monthly add-on: base price on the plan, no per-unit item price. */
export const ssoAddOnSpec: PlanSpec = {
	add_on: true,
	price: { amount: 150, interval: "month" },
};

/** ② plan-per-tier siblings: Pro's shape (overage included) at bigger
 * numbers — graded on the materialized variant. */
export const apiPro100kSpec: PlanSpec = {
	price: { amount: 45, interval: "month" },
	items: [
		{
			included: 100000,
			price: { amount: 0.8, billing_units: 1000 },
		},
	],
};

export const apiPro200kSpec: PlanSpec = {
	price: { amount: 80, interval: "month" },
	items: [
		{
			included: 200000,
			price: { amount: 0.8, billing_units: 1000 },
		},
	],
};

/** ② second ladder, other line: Campaigns Pro contact tiers. */
export const campaignsPro25kSpec: PlanSpec = {
	price: { amount: 150, interval: "month" },
	items: [{ included: 25000 }],
};

export const campaignsPro100kSpec: PlanSpec = {
	price: { amount: 400, interval: "month" },
	items: [{ included: 100000 }],
};

/** Known-correct config. withTierVariants adds the 100k/200k Pro siblings
 * (the seed case's golden); without them it's the seed workspace. */
export const messagingApiConfig = ({
	withTierVariants = false,
}: {
	withTierVariants?: boolean;
} = {}): string => `import { feature, plan, item } from "atmn";

export const messages = feature({
	id: "messages",
	name: "Messages",
	type: "metered",
	consumable: true,
});

export const contacts = feature({
	id: "contacts",
	name: "Contacts",
	type: "metered",
	consumable: false,
});

export const sso = feature({
	id: "sso",
	name: "SSO",
	type: "boolean",
});

const messageOverage = {
	amount: 0.8,
	billingUnits: 1000,
	billingMethod: "usage_based",
	interval: "month",
} as const;

export const apiFree = plan({
	id: "api_free",
	name: "API Free",
	group: "api",
	autoEnable: true,
	items: [
		item({ featureId: messages.id, included: 3000, reset: { interval: "month" } }),
	],
});

export const apiPro = plan({
	id: "api_pro",
	name: "API Pro",
	group: "api",
	price: { amount: 25, interval: "month" },
	items: [
		item({
			featureId: messages.id,
			included: 50000,
			reset: { interval: "month" },
			price: messageOverage,
		}),
	],
});

export const campaignsFree = plan({
	id: "campaigns_free",
	name: "Campaigns Free",
	group: "campaigns",
	autoEnable: true,
	items: [item({ featureId: contacts.id, included: 1000 })],
});

export const campaignsPro = plan({
	id: "campaigns_pro",
	name: "Campaigns Pro",
	group: "campaigns",
	price: { amount: 40, interval: "month" },
	items: [item({ featureId: contacts.id, included: 5000 })],
});

export const ssoAddOn = plan({
	id: "sso_add_on",
	name: "SSO",
	addOn: true,
	price: { amount: 150, interval: "month" },
	items: [item({ featureId: sso.id })],
});
${
	withTierVariants
		? `
export const apiPro100k = apiPro.variant({
	id: "api_pro_100k",
	name: "API Pro 100K",
	customize: {
		price: { amount: 45, interval: "month" },
		addItems: [
			item({
				featureId: messages.id,
				included: 100000,
				reset: { interval: "month" },
				price: messageOverage,
			}),
		],
		removeItems: [{ featureId: messages.id }],
	},
});

export const apiPro200k = apiPro.variant({
	id: "api_pro_200k",
	name: "API Pro 200K",
	customize: {
		price: { amount: 80, interval: "month" },
		addItems: [
			item({
				featureId: messages.id,
				included: 200000,
				reset: { interval: "month" },
				price: messageOverage,
			}),
		],
		removeItems: [{ featureId: messages.id }],
	},
});

export const campaignsPro25k = campaignsPro.variant({
	id: "campaigns_pro_25k",
	name: "Campaigns Pro 25K",
	customize: {
		price: { amount: 150, interval: "month" },
		addItems: [item({ featureId: contacts.id, included: 25000 })],
		removeItems: [{ featureId: contacts.id }],
	},
});

export const campaignsPro100k = campaignsPro.variant({
	id: "campaigns_pro_100k",
	name: "Campaigns Pro 100K",
	customize: {
		price: { amount: 400, interval: "month" },
		addItems: [item({ featureId: contacts.id, included: 100000 })],
		removeItems: [{ featureId: contacts.id }],
	},
});
`
		: ""
}`;
