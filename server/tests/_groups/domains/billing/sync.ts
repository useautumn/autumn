import type { TestGroup } from "../../types";

export const sync: TestGroup = {
	name: "sync",
	description:
		"Stripe <-> Autumn sync back: sync-proposals/syncV2 engine and subscription.created/updated auto-sync webhooks",
	tier: "domain",
	maxConcurrency: 3,
	paths: [
		"integration/billing/sync",
		"integration/billing/stripe-webhooks/subscription-created",
		"integration/billing/stripe-webhooks/subscription-updated",
		"unit/billing/is-autumn-managed-subscription-metadata.test.ts",
	],
};
