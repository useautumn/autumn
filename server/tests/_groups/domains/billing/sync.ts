import type { TestGroup } from "../../types";

export const sync: TestGroup = {
	name: "sync",
	description:
		"Stripe <-> Autumn sync back: sync-proposals/syncV2 engine, subscription.created/updated auto-sync webhooks, and their matching/detection unit tests",
	tier: "domain",
	maxConcurrency: 3,
	paths: [
		"integration/billing/sync",
		"integration/billing/stripe-webhooks/subscription-created",
		"integration/billing/stripe-webhooks/subscription-updated",
		"unit/billing/sync",
		"unit/billing/stripe/match-utils",
		"unit/billing/is-autumn-managed-subscription-metadata.test.ts",
	],
};
