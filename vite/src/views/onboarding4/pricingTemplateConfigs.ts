interface PricingTemplatePrompt {
	id: string;
	label: string;
	icon: string;
	prompt: string;
}

export const PRICING_TEMPLATE_PROMPTS: PricingTemplatePrompt[] = [
	{
		id: "cursor",
		label: "Cursor",
		icon: "/templates/cursor.svg",
		prompt: `Please build me Cursor's pricing:

- Free plan: 50 agent requests per month, 200 tab completions per month
- Pro at $20/month: 500 agent requests per month, unlimited tab completions
- Pro+ at $60/month: 1500 agent requests per month (3x Pro), unlimited tab completions
- Ultra at $200/month: 10000 agent requests per month (20x Pro), unlimited tab completions`,
	},
	{
		id: "railway",
		label: "Railway",
		icon: "/templates/railway.svg",
		prompt: `Please build me Railway's pricing:

This is a credit-based system where 1 credit = $0.01, and different resources cost different amounts of credits:
- Memory: 0.039 credits per GB-hour
- CPU: 0.078 credits per vCPU-hour
- Egress: 5 credits per GB
- Storage: 1.5 credits per GB-month

Plans:
- Free plan with 500 credits as a one-time grant (worth $5)
- Hobby at $5/month: Includes 500 credits per month, pay-per-use after that
- Pro at $20/month: Includes 2000 credits per month, pay-per-use after that`,
	},
	{
		id: "linear",
		label: "Linear",
		icon: "/templates/linear.svg",
		prompt: `Please build me Linear's pricing:

- Free plan: 2 teams, 250 issues limit
- Basic at $12/user/month: 5 teams, unlimited issues
- Business at $18/user/month: Unlimited teams, unlimited issues`,
	},
	{
		id: "t3-chat",
		label: "T3 Chat",
		icon: "/templates/t3.svg",
		prompt: `Please build me T3 Chat's pricing:

- Free plan with 100 standard messages per month
- Pro at $8/month: 1500 standard messages per month, 100 premium messages per month
- Premium credits add-on: $8 for 100 premium messages (prepaid, one-time purchase, can buy multiple times)`,
	},
	{
		id: "openai",
		label: "OpenAI",
		icon: "/templates/openai.svg",
		prompt: `Please build me OpenAI's pricing:

Fully prepaid credit system where 1 credit = $0.001, with different models costing different amounts:

Credit schema (per 1K tokens):
- GPT-5 mini input: 0.25 credits per 1K tokens
- GPT-5 mini output: 2 credits per 1K tokens
- GPT-5.2 input: 1.75 credits per 1K tokens
- GPT-5.2 output: 14 credits per 1K tokens
- GPT-5.2 pro input: 21 credits per 1K tokens
- GPT-5.2 pro output: 168 credits per 1K tokens

Plans:
- Free plan with 2000 credits as a one-time grant (worth $2)
- Credits add-on: $10 for 10000 credits (prepaid, one-time purchase)`,
	},
];
