import type { PlanSpec } from "../../../src/grading/types/planSpec.ts";

export const messagingApiGoal =
	"Get your messaging API's two product lines set up in Autumn without touching a dashboard.";

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

export const messagingApiUserFacts = [
	messagingApiFacts,
	"- If asked how the API and Campaigns plans relate: they're independent — a customer can be on one plan of each at the same time; it's not one upgrade path.",
	"- If asked about overage on Campaigns/contacts: there is none — the contact caps are hard limits.",
].join("\n");

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

export const campaignsFreeSpec: PlanSpec = {
	freePlan: true,
	auto_enable: true,
	items: [{ included: 1000 }],
};

export const campaignsProSpec: PlanSpec = {
	price: { amount: 40, interval: "month" },
	items: [{ included: 5000 }],
};

export const ssoAddOnSpec: PlanSpec = {
	add_on: true,
	price: { amount: 150, interval: "month" },
};

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

export const campaignsPro25kSpec: PlanSpec = {
	price: { amount: 150, interval: "month" },
	items: [{ included: 25000 }],
};

export const campaignsPro100kSpec: PlanSpec = {
	price: { amount: 400, interval: "month" },
	items: [{ included: 100000 }],
};

const messageOverage = `{
					amount: 0.8,
					billingUnits: 1000,
					billingMethod: "usage_based",
					interval: "month",
				}`;

export const messagingApiConfig = ({
	withTierVariants = false,
	extraPlans = "",
}: {
	withTierVariants?: boolean;
	extraPlans?: string;
} = {}): string => `import { atmn, feature, plan, variant } from "atmn";

export default atmn({
	features: [
		feature({
			featureId: "messages",
			name: "Messages",
			type: "metered",
			consumable: true,
		}),
		feature({
			featureId: "contacts",
			name: "Contacts",
			type: "metered",
			consumable: false,
		}),
		feature({
			featureId: "sso",
			name: "SSO",
			type: "boolean",
		}),
	],
	plans: [
		plan({
			planId: "api_free",
			versionSlug: "v1",
			active: true,
			name: "API Free",
			group: "api",
			autoEnable: true,
			items: [
				{
					featureId: "messages",
					included: 3000,
					reset: { interval: "month" },
				},
			],
		}),
		plan({
			planId: "api_pro",
			versionSlug: "v1",
			active: true,
			name: "API Pro",
			group: "api",
			price: { amount: 25, interval: "month" },
			items: [
				{
					featureId: "messages",
					included: 50000,
					reset: { interval: "month" },
					price: ${messageOverage},
				},
			],
${
	withTierVariants
		? `			variants: [
				variant({
					variantPlanId: "api_pro_100k",
					versionSlug: "v1",
					name: "API Pro 100K",
					customize: {
						price: { amount: 45, interval: "month" },
						items: [
							{
								featureId: "messages",
								included: 100000,
								reset: { interval: "month" },
								price: ${messageOverage},
							},
						],
					},
				}),
				variant({
					variantPlanId: "api_pro_200k",
					versionSlug: "v1",
					name: "API Pro 200K",
					customize: {
						price: { amount: 80, interval: "month" },
						items: [
							{
								featureId: "messages",
								included: 200000,
								reset: { interval: "month" },
								price: ${messageOverage},
							},
						],
					},
				}),
			],
`
		: ""
}		}),
		plan({
			planId: "campaigns_free",
			versionSlug: "v1",
			active: true,
			name: "Campaigns Free",
			group: "campaigns",
			autoEnable: true,
			items: [{ featureId: "contacts", included: 1000 }],
		}),
		plan({
			planId: "campaigns_pro",
			versionSlug: "v1",
			active: true,
			name: "Campaigns Pro",
			group: "campaigns",
			price: { amount: 40, interval: "month" },
			items: [{ featureId: "contacts", included: 5000 }],
${
	withTierVariants
		? `			variants: [
				variant({
					variantPlanId: "campaigns_pro_25k",
					versionSlug: "v1",
					name: "Campaigns Pro 25K",
					customize: {
						price: { amount: 150, interval: "month" },
						items: [{ featureId: "contacts", included: 25000 }],
					},
				}),
				variant({
					variantPlanId: "campaigns_pro_100k",
					versionSlug: "v1",
					name: "Campaigns Pro 100K",
					customize: {
						price: { amount: 400, interval: "month" },
						items: [{ featureId: "contacts", included: 100000 }],
					},
				}),
			],
`
		: ""
}		}),
		plan({
			planId: "sso_add_on",
			versionSlug: "v1",
			active: true,
			name: "SSO",
			addOn: true,
			price: { amount: 150, interval: "month" },
			items: [{ featureId: "sso" }],
		}),
${extraPlans}	],
});
`;
