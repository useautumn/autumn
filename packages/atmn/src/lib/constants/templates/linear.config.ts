/**
 * Linear - Project management with per-seat pricing
 * Free (2 teams, 250 issues) / Basic ($12/seat/mo) / Business ($18/seat/mo)
 */

import type { Feature, Plan } from "../../../compose/models/index.js";

export const features: Feature[] = [
	{
		id: "seats",
		name: "Seats",
		type: "metered",
		consumable: false,
	},
	{
		id: "teams",
		name: "Teams",
		type: "metered",
		consumable: false,
	},
	{
		id: "issues",
		name: "Issues",
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
			{ featureId: "teams", included: 2 },
			{ featureId: "issues", included: 250, reset: { interval: "one_off" } },
			{ featureId: "seats", unlimited: true },
		],
	},
	{
		id: "basic",
		name: "Basic",
		price: { amount: 12, interval: "month" },
		items: [
			{
				featureId: "seats",
				included: 1,
				price: {
					amount: 12,
					billingMethod: "usage_based",
					billingUnits: 1,
					interval: "month",
				},
			},
			{ featureId: "teams", included: 5 },
			{ featureId: "issues", unlimited: true },
		],
	},
	{
		id: "business",
		name: "Business",
		price: { amount: 18, interval: "month" },
		items: [
			{
				featureId: "seats",
				included: 1,
				price: {
					amount: 18,
					billingMethod: "usage_based",
					billingUnits: 1,
					interval: "month",
				},
			},
			{ featureId: "teams", unlimited: true },
			{ featureId: "issues", unlimited: true },
		],
	},
];
