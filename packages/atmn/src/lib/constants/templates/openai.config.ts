/**
 * OpenAI - API-style pricing with credit system
 * Free (2000 credits) / Credits Top-Up (prepaid add-on)
 * 1 credit = $0.001
 */

import type { Feature, Plan } from "../../../compose/models/index.js";

export const features: Feature[] = [
	{
		id: "credits",
		name: "Credits",
		type: "credit_system",
		creditSchema: [
			{ meteredFeatureId: "gpt5_mini_input", creditCost: 0.25 },
			{ meteredFeatureId: "gpt5_mini_output", creditCost: 2 },
			{ meteredFeatureId: "gpt52_input", creditCost: 1.75 },
			{ meteredFeatureId: "gpt52_output", creditCost: 14 },
			{ meteredFeatureId: "gpt52_pro_input", creditCost: 21 },
			{ meteredFeatureId: "gpt52_pro_output", creditCost: 168 },
		],
	},
	{
		id: "gpt5_mini_input",
		name: "GPT-5 Mini Input",
		type: "metered",
		consumable: true,
	},
	{
		id: "gpt5_mini_output",
		name: "GPT-5 Mini Output",
		type: "metered",
		consumable: true,
	},
	{
		id: "gpt52_input",
		name: "GPT-5.2 Input",
		type: "metered",
		consumable: true,
	},
	{
		id: "gpt52_output",
		name: "GPT-5.2 Output",
		type: "metered",
		consumable: true,
	},
	{
		id: "gpt52_pro_input",
		name: "GPT-5.2 Pro Input",
		type: "metered",
		consumable: true,
	},
	{
		id: "gpt52_pro_output",
		name: "GPT-5.2 Pro Output",
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
			{ featureId: "credits", included: 2000, reset: { interval: "one_off" } },
		],
	},
	{
		id: "credits-top-up",
		name: "Credits Top-Up",
		addOn: true,
		items: [
			{
				featureId: "credits",
				price: {
					amount: 10,
					billingMethod: "prepaid",
					billingUnits: 10000,
					interval: "month",
				},
			},
		],
	},
];
