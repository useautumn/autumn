export interface PricingTier {
	name: string;
	price: string;
	interval?: string;
	description?: string;
	features: string[];
	highlighted?: boolean;
}

interface TemplateConfig {
	id: string;
	name: string;
	company: string;
	tags: string[];
	description: string;
	pricingTiers: PricingTier[];
	websiteUrl: string;
}

const TEMPLATE_CONFIGS: TemplateConfig[] = [
	{
		id: "cursor",
		name: "Cursor",
		company: "Cursor",
		tags: ["Usage-based", "Trial", "Freemium"],
		description:
			"AI-powered code editor with a generous free tier and usage-based premium features. Users get free completions and can upgrade for more advanced AI capabilities with metered usage.",
		pricingTiers: [
			{
				name: "Hobby",
				price: "Free",
				description: "For casual developers",
				features: [
					"2000 completions",
					"50 slow premium requests",
					"200 cursor-small uses",
				],
			},
			{
				name: "Pro",
				price: "$20",
				interval: "month",
				description: "For professional developers",
				features: [
					"Unlimited completions",
					"500 fast premium requests",
					"Unlimited slow premium requests",
					"Unlimited cursor-small uses",
				],
				highlighted: true,
			},
			{
				name: "Business",
				price: "$40",
				interval: "user/month",
				description: "For teams",
				features: [
					"Everything in Pro",
					"Centralized billing",
					"Admin dashboard",
					"Enforce privacy mode",
					"SAML/OIDC SSO",
				],
			},
		],
		websiteUrl: "https://cursor.com/pricing",
	},
	{
		id: "railway",
		name: "Railway",
		company: "Railway",
		tags: ["Credits", "Usage-based", "Pay-as-you-go"],
		description:
			"Infrastructure platform with credit-based pricing. Users receive monthly credits and pay for additional usage based on compute, memory, and egress consumption.",
		pricingTiers: [
			{
				name: "Hobby",
				price: "Free",
				description: "For personal projects",
				features: [
					"$5 of usage per month",
					"Limited to 500 execution hours",
					"Community support",
				],
			},
			{
				name: "Pro",
				price: "$20",
				interval: "user/month",
				description: "For teams and startups",
				features: [
					"Includes $10 of usage",
					"Unlimited execution hours",
					"Team collaboration",
					"Priority support",
				],
				highlighted: true,
			},
			{
				name: "Enterprise",
				price: "Custom",
				description: "For large organizations",
				features: [
					"Volume discounts",
					"Dedicated support",
					"SLA guarantees",
					"Custom contracts",
				],
			},
		],
		websiteUrl: "https://railway.app/pricing",
	},
	{
		id: "t3-chat",
		name: "T3 Chat",
		company: "T3 Chat",
		tags: ["Prepaid", "Add-ons", "Subscription"],
		description:
			"AI chat platform with subscription tiers and prepaid message packs. Users subscribe to a base plan and can purchase additional message credits as needed.",
		pricingTiers: [
			{
				name: "Free",
				price: "Free",
				description: "Try it out",
				features: ["Limited messages", "Basic models", "Web access only"],
			},
			{
				name: "Plus",
				price: "$8",
				interval: "month",
				description: "For regular users",
				features: [
					"1000 messages/month",
					"All models",
					"Mobile app access",
					"Message history",
				],
				highlighted: true,
			},
			{
				name: "Message Pack",
				price: "$5",
				description: "Add-on",
				features: ["500 additional messages", "Never expires", "Use anytime"],
			},
		],
		websiteUrl: "https://t3.chat",
	},
	{
		id: "openai",
		name: "OpenAI API",
		company: "OpenAI",
		tags: ["Credits", "Prepaid", "Pay-as-you-go"],
		description:
			"API platform with prepaid credits and pay-as-you-go pricing. Developers purchase credits upfront and consume them based on token usage across different models.",
		pricingTiers: [
			{
				name: "Free Tier",
				price: "Free",
				description: "Get started",
				features: [
					"$5 free credits",
					"Rate limited",
					"Access to GPT-3.5",
					"3 months expiry",
				],
			},
			{
				name: "Pay as you go",
				price: "Usage-based",
				description: "For developers",
				features: [
					"All models access",
					"Higher rate limits",
					"Pay per token",
					"No monthly commitment",
				],
				highlighted: true,
			},
			{
				name: "Enterprise",
				price: "Custom",
				description: "For organizations",
				features: [
					"Volume discounts",
					"Dedicated capacity",
					"Custom models",
					"Enterprise support",
				],
			},
		],
		websiteUrl: "https://openai.com/pricing",
	},
	{
		id: "notion",
		name: "Notion",
		company: "Notion",
		tags: ["Per-seat", "Add-ons", "Freemium"],
		description:
			"Workspace platform with per-seat pricing and AI add-ons. Teams pay per member with optional AI features available as an additional subscription.",
		pricingTiers: [
			{
				name: "Free",
				price: "Free",
				description: "For individuals",
				features: [
					"Unlimited pages",
					"Share with 10 guests",
					"7 day page history",
					"Basic integrations",
				],
			},
			{
				name: "Plus",
				price: "$10",
				interval: "user/month",
				description: "For small teams",
				features: [
					"Unlimited team members",
					"Unlimited file uploads",
					"30 day page history",
					"100 guest collaborators",
				],
				highlighted: true,
			},
			{
				name: "AI Add-on",
				price: "$8",
				interval: "user/month",
				description: "Add-on",
				features: [
					"AI writing assistant",
					"AI autofill",
					"AI summaries",
					"Works on any plan",
				],
			},
		],
		websiteUrl: "https://notion.so/pricing",
	},
	{
		id: "lovable",
		name: "Lovable",
		company: "Lovable",
		tags: ["Prepaid", "Credits", "Subscription"],
		description:
			"AI app builder with prepaid credit packs. Users subscribe to plans with included credits and can purchase additional credit packs for more generation capacity.",
		pricingTiers: [
			{
				name: "Free",
				price: "Free",
				description: "Try it out",
				features: [
					"Limited credits",
					"1 project",
					"Community support",
					"Basic features",
				],
			},
			{
				name: "Starter",
				price: "$20",
				interval: "month",
				description: "For builders",
				features: [
					"100 credits/month",
					"5 projects",
					"Priority support",
					"All features",
				],
				highlighted: true,
			},
			{
				name: "Credit Pack",
				price: "$10",
				description: "Add-on",
				features: [
					"50 additional credits",
					"Never expires",
					"Use across projects",
				],
			},
		],
		websiteUrl: "https://lovable.dev/pricing",
	},
];
