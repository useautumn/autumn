import type { TestGroup } from "../types";

export const coreBackSync: TestGroup = {
	name: "core-back-sync",
	description:
		"Core Stripe subscription-created and subscription-updated back-sync tests",
	tier: "core",
	paths: [
		"integration/billing/stripe-webhooks/subscription-created",
		"integration/billing/stripe-webhooks/subscription-updated",
	],
};
