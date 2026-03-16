/**
 * Railway - Credit-based infrastructure pricing
 * Free (500 credits) / Hobby ($5/mo) / Pro ($20/mo)
 * 1 credit = $0.01
 */

import type { Feature, Plan } from "../../../compose/models/index.js";

export const features: Feature[] = [
	{
		id: "credits",
		name: "Credits",
		type: "credit_system",
		creditSchema: [
			{ meteredFeatureId: "memory", creditCost: 0.039 },
			{ meteredFeatureId: "cpu", creditCost: 0.078 },
			{ meteredFeatureId: "egress", creditCost: 5 },
			{ meteredFeatureId: "storage", creditCost: 1.5 },
		],
	},
	{
		id: "memory",
		name: "Memory",
		type: "metered",
		consumable: true,
	},
	{
		id: "cpu",
		name: "CPU",
		type: "metered",
		consumable: true,
	},
	{
		id: "egress",
		name: "Egress",
		type: "metered",
		consumable: true,
	},
	{
		id: "storage",
		name: "Storage",
		type: "metered",
		consumable: true,
	},
];

export const plans: Plan[] = [
	{
		id: "free",
		name: "Free",
		autoEnable: true,
		items: [
			{ featureId: "credits", included: 500, reset: { interval: "one_off" } },
		],
	},
	{
		id: "hobby",
		name: "Hobby",
		price: { amount: 5, interval: "month" },
		items: [
			{
				featureId: "credits",
				included: 500,
				reset: { interval: "month" },
				price: {
					amount: 0.01,
					billingMethod: "usage_based",
					billingUnits: 1,
				},
			},
		],
	},
	{
		id: "pro",
		name: "Pro",
		price: { amount: 20, interval: "month" },
		items: [
			{
				featureId: "credits",
				included: 2000,
				reset: { interval: "month" },
				price: {
					amount: 0.01,
					billingMethod: "usage_based",
					billingUnits: 1,
				},
			},
		],
	},
];
