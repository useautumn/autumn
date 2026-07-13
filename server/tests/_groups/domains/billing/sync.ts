import type { TestGroup } from "../../types";

export const sync: TestGroup = {
	name: "sync",
	description:
		"Stripe <-> Autumn sync back: sync-proposals/syncV2 engine and subscription.created/updated auto-sync webhooks",
	tier: "domain",
	maxConcurrency: 3,
	// unit/billing/sync and unit/billing/stripe/match-utils hold more sync
	// coverage but are *.spec.ts, which the group dispatcher can't discover.
	paths: [
		"integration/billing/sync",
		"integration/billing/stripe-webhooks/subscription-created",
		"integration/billing/stripe-webhooks/subscription-updated",
		"unit/billing/is-autumn-managed-subscription-metadata.test.ts",
	],
};
