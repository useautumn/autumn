import type { PlanSpec } from "../../../src/grading/types/planSpec.ts";

/**
 * Anonymized real-customer archetype: a developer messaging API. Free/Pro/
 * Scale bill on messages sent with a per-1,000 overage (billing_units trap),
 * non-resetting channel limits, and three add-on shapes: flat-priced SSO,
 * prepaid dedicated gateways, and a graduated pay-as-you-go workflows ladder
 * ending at "inf".
 */

export const messagingApiGoal =
	"Get your messaging API's plans set up in Autumn without touching a dashboard.";

export const messagingApiFacts = [
	"- There's a free plan, then Pro at $25 a month and Scale at $95 a month.",
	"- You bill on messages sent — free gets 3,000 a month, Pro 50,000, Scale 150,000.",
	"- Channels are limited too: 2 on free, 10 on Pro, 50 on Scale — those don't reset, they're just caps.",
	"- Nothing on/off inside the base plans — SSO exists but it's a paid add-on, leave it out for now.",
	"- On the paid plans going over is $0.80 per 1,000 messages, billed at the end of the month. The free plan just stops.",
	"- No trials.",
].join("\n");

/** Free tier: no base price, monthly-resetting message allowance. */
export const freeSpec: PlanSpec = {
	freePlan: true,
	items: [{ included: 3000, reset: { interval: "month" } }],
};

/** The billing_units trap: "$0.80 per 1,000" must be amount 0.8 per 1,000
 * units — amount 0.8 per unit is an 800x overcharge. */
export const proSpec: PlanSpec = {
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

export const scaleSpec: PlanSpec = {
	price: { amount: 95, interval: "month" },
	items: [{ included: 150000, reset: { interval: "month" } }],
};

/** Graduated ladder must end open-ended ("after that") — a final inf tier. */
export const workflowsAddOnSpec: PlanSpec = {
	add_on: true,
	items: [
		{
			price: {
				billing_method: "usage_based",
				billing_units: 1000,
				tiers: [{ to: "inf", amount: 1 }],
			},
		},
	],
};

/** Quantity bought upfront, recurring: prepaid, not usage_based. */
export const gatewayAddOnSpec: PlanSpec = {
	add_on: true,
	items: [{ price: { billing_method: "prepaid", amount: 40 } }],
};

/** Flat monthly add-on: base price on the plan, no per-unit item price. */
export const ssoAddOnSpec: PlanSpec = {
	add_on: true,
	price: { amount: 120, interval: "month" },
};

/** Known-correct config for grader proofs. withAddOns=false gives just the
 * three base plans (the discovery case's golden). */
export const messagingApiConfig = ({
	withAddOns = true,
}: {
	withAddOns?: boolean;
} = {}): string => `import { feature, plan, item } from "atmn";

export const messages = feature({
	id: "messages",
	name: "Messages",
	type: "metered",
	consumable: true,
});

export const channels = feature({
	id: "channels",
	name: "Channels",
	type: "metered",
	consumable: false,
});

export const workflowRuns = feature({
	id: "workflow_runs",
	name: "Workflow Runs",
	type: "metered",
	consumable: true,
});

export const dedicatedGateways = feature({
	id: "dedicated_gateways",
	name: "Dedicated Gateways",
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

export const free = plan({
	id: "free",
	name: "Free",
	items: [
		item({ featureId: messages.id, included: 3000, reset: { interval: "month" } }),
		item({ featureId: channels.id, included: 2 }),
	],
});

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: { amount: 25, interval: "month" },
	items: [
		item({
			featureId: messages.id,
			included: 50000,
			reset: { interval: "month" },
			price: messageOverage,
		}),
		item({ featureId: channels.id, included: 10 }),
	],
});

export const scale = plan({
	id: "scale",
	name: "Scale",
	price: { amount: 95, interval: "month" },
	items: [
		item({
			featureId: messages.id,
			included: 150000,
			reset: { interval: "month" },
			price: messageOverage,
		}),
		item({ featureId: channels.id, included: 50 }),
	],
});
${
	withAddOns
		? `
export const workflows = plan({
	id: "workflows",
	name: "Workflows",
	addOn: true,
	items: [
		item({
			featureId: workflowRuns.id,
			included: 0,
			reset: { interval: "month" },
			price: {
				tiers: [
					{ to: 50000, amount: 2 },
					{ to: 250000, amount: 1.5 },
					{ to: "inf", amount: 1 },
				],
				billingUnits: 1000,
				billingMethod: "usage_based",
				tierBehavior: "graduated",
				interval: "month",
			},
		}),
	],
});

export const dedicatedGatewayAddOn = plan({
	id: "dedicated_gateway_add_on",
	name: "Dedicated Gateway",
	addOn: true,
	items: [
		item({
			featureId: dedicatedGateways.id,
			included: 0,
			price: {
				amount: 40,
				billingUnits: 1,
				billingMethod: "prepaid",
				interval: "month",
			},
		}),
	],
});

export const ssoAddOn = plan({
	id: "sso_add_on",
	name: "SSO",
	addOn: true,
	price: { amount: 120, interval: "month" },
	items: [item({ featureId: sso.id })],
});
`
		: ""
}`;
