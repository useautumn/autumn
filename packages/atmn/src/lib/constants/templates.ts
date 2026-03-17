/**
 * Template data for the template selector
 * Each template has 3 pricing plans with features
 */

export interface PlanData {
	name: string;
	features: string[];
	price: string;
	badge?: string;
}

export const templateData: Record<string, PlanData[]> = {
	Railway: [
		{
			name: "Free",
			features: [
				"500 credits one-time",
				"Memory: 0.039cr/GB-hr",
				"CPU: 0.078cr/vCPU-hr",
				"Egress: 5cr/GB",
			],
			price: "$0",
		},
		{
			name: "Hobby",
			badge: "most popular",
			features: [
				"500 credits/month",
				"Pay-per-use overage",
				"Memory: 0.039cr/GB-hr",
				"CPU: 0.078cr/vCPU-hr",
				"Egress: 5cr/GB",
				"Storage: 1.5cr/GB-mo",
			],
			price: "$5/month",
		},
		{
			name: "Pro",
			features: [
				"2000 credits/month",
				"Pay-per-use overage",
				"All resource types",
				"Team features",
				"Priority support",
			],
			price: "$20/month",
		},
	],
	Linear: [
		{
			name: "Free",
			features: [
				"2 teams",
				"250 issues limit",
				"Basic integrations",
				"Community support",
			],
			price: "$0",
		},
		{
			name: "Basic",
			badge: "most popular",
			features: [
				"5 teams",
				"Unlimited issues",
				"All integrations",
				"Cycles & roadmaps",
				"Email support",
				"Guest access",
			],
			price: "$12/user/mo",
		},
		{
			name: "Business",
			features: [
				"Unlimited teams",
				"Unlimited issues",
				"SAML SSO",
				"Audit logs",
				"Priority support",
			],
			price: "$18/user/mo",
		},
	],
	"T3 Chat": [
		{
			name: "Free",
			features: ["100 messages", "/month", "Basic models", "Web access"],
			price: "$0",
		},
		{
			name: "Pro",
			badge: "most popular",
			features: [
				"1500 messages/month",
				"100 premium/month",
				"All models",
				"Priority access",
				"Faster responses",
				"File uploads",
			],
			price: "$8/month",
		},
		{
			name: "Credits",
			features: [
				"100 premium",
				"messages",
				"One-time purchase",
				"Never expires",
			],
			price: "$8 add-on",
		},
	],
};

export const templates = ["Railway", "Linear", "T3 Chat"] as const;

export type TemplateName = (typeof templates)[number];
