/**
 * Template data for the template selector UI
 */

export interface TemplateBadge {
	label: string;
	color: "cyan" | "yellow" | "green" | "blue" | "gray" | "magenta";
}

export interface TemplateTier {
	name: string;
	price: string;
	features: string[];
}

export interface TemplateCreditCost {
	action: string;
	credits: string;
}

export interface Template {
	id: string;
	name: string;
	description: string;
	badges: TemplateBadge[];
	creditSystem?: {
		costs: TemplateCreditCost[];
	};
	tiers: TemplateTier[];
}

export const templates: Template[] = [
	{
		id: "openai",
		name: "OpenAI",
		description:
			"API-style pricing with free and prepaid credits. 1 credit = 0.001 USD.",
		badges: [
			{ label: "credit system", color: "cyan" },
			{ label: "top ups", color: "yellow" },
		],
		creditSystem: {
			costs: [
				{ action: "GPT-5 Mini Input", credits: "0.25" },
				{ action: "GPT-5 Mini Output", credits: "2" },
				{ action: "GPT-5.2 Input", credits: "1.75" },
				{ action: "GPT-5.2 Output", credits: "14" },
				{ action: "GPT-5.2 Pro Input", credits: "21" },
				{ action: "GPT-5.2 Pro Output", credits: "168" },
			],
		},
		tiers: [
			{
				name: "Trial Credits",
				price: "Free",
				features: ["2000 Credits (2 USD)"],
			},
			{
				name: "Top-Up Credits",
				price: "Variable",
				features: ["10 USD per 10,000 Credits"],
			},
		],
	},
	{
		id: "railway",
		name: "Railway",
		description:
			"Infrastructure platform with credit-based compute pricing. 1 credit = 0.01 USD.",
		badges: [
			{ label: "credit system", color: "cyan" },
			{ label: "usage based", color: "green" },
		],
		creditSystem: {
			costs: [
				{ action: "Memory", credits: "0.039" },
				{ action: "CPU", credits: "0.078" },
				{ action: "Egress", credits: "5" },
				{ action: "Storage", credits: "1.5" },
			],
		},
		tiers: [
			{
				name: "Free",
				price: "Free",
				features: ["500 credits included"],
			},
			{
				name: "Hobby",
				price: "$5/month",
				features: ["500 credits", "then usage-based pricing"],
			},
			{
				name: "Pro",
				price: "$20/month",
				features: ["2,000 credits included", "then usage-based pricing"],
			},
		],
	},
	{
		id: "t3chat",
		name: "T3 Chat",
		description:
			"Freemium chat app with monthly message limits and premium message add-ons",
		badges: [
			{ label: "top ups", color: "yellow" },
			{ label: "add-on", color: "green" },
		],
		tiers: [
			{
				name: "Free",
				price: "Free",
				features: ["100 standard messages per month"],
			},
			{
				name: "Pro",
				price: "$8 per month",
				features: [
					"1,500 standard messages per month",
					"100 premium messages per month",
				],
			},
			{
				name: "Premium Credits",
				price: "Variable",
				features: ["$8 per 100 premium messages"],
			},
		],
	},
	{
		id: "linear",
		name: "Linear",
		description: "Project management tool with per-seat pricing",
		badges: [{ label: "seat-based", color: "magenta" }],
		tiers: [
			{
				name: "Free",
				price: "Free",
				features: ["2 teams", "250 issues", "Unlimited seats"],
			},
			{
				name: "Basic",
				price: "$12/seat/month",
				features: ["5 teams", "Unlimited issues"],
			},
			{
				name: "Business",
				price: "$18/seat/month",
				features: ["Unlimited teams", "Unlimited issues"],
			},
		],
	},
];
