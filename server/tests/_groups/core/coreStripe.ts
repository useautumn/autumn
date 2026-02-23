import type { TestGroup } from "../types";

export const coreStripe: TestGroup = {
	name: "core-stripe",
	description: "Core Stripe webhook tests",
	tier: "core",
	paths: [
		"stripe-webhooks/subscription-updated",
		"stripe-webhooks/subscription-deleted/subscription-deleted.test.ts",
		"stripe-webhooks/subscription-deleted/subscription-deleted-invoice.test.ts",
		"stripe-webhooks/invoice-created/invoice-created-consumable.test.ts",
		"stripe-webhooks/invoice-created/invoice-created-entity-consumable.test.ts",
	],
};
