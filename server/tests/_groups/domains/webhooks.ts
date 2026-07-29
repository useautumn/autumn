import type { TestGroup } from "../types";

export const webhooks: TestGroup = {
	name: "webhooks",
	description: "Stripe and Autumn webhook handlers",
	tier: "domain",
	maxConcurrency: 3,
	paths: [
		"integration/billing/stripe-webhooks",
		"integration/billing/autumn-webhooks",
	],
};
