import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Default product behavior verification tests",
	tier: "domain",
	paths: [
		// Cancel immediately with default tests
		"integration/billing/update-subscription/cancel/immediately/cancel-immediately.test.ts",

		// Cancel end of cycle tests
		"integration/billing/update-subscription/cancel/end-of-cycle/cancel-end-of-cycle.test.ts",

		// Uncancel tests
		"integration/billing/update-subscription/cancel/uncancel/uncancel-basic.test.ts",

		// Create customer with defaults
		"integration/crud/customers/create-customer-defaults.test.ts",

		// Default applies to entities (the new behavior)
		"integration/org-config/default-applies-to-entity.test.ts",

		// Stripe webhook: subscription deleted (activates defaults)
		"integration/billing/stripe-webhooks/subscription-deleted/subscription-deleted.test.ts",

		// Stripe webhook: subscription updated uncancel
		"integration/billing/stripe-webhooks/subscription-updated/subscription-updated-uncancel.test.ts",

		// Scheduled switch basic (pro to free downgrade flows)
		"integration/billing/attach/scheduled-switch/scheduled-switch-basic.test.ts",

		// Scheduled switch with entities
		"integration/billing/attach/scheduled-switch/scheduled-switch-entities-basic.test.ts",

		// Invoice created consumable (usage-in-arrear)
		"integration/billing/stripe-webhooks/invoice-created/invoice-created-consumable.test.ts",
	],
};
