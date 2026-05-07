import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description:
		"sub.created auto-sync + sync param detection + restore (Autumn → Stripe)",
	tier: "domain",
	paths: [
		// "integration/billing/stripe-webhooks/subscription-created",
		"integration/billing/sync/to-sync-params",
		// "integration/billing/restore",
		"integration/balances/track/basic/track-credit-system-all-balances",
		"integration/balances/check/check-send-event-credit-system",
	],
};
