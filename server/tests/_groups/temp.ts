import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Failed tests from billing V2 run",
	tier: "domain",
	paths: [
		"integration/billing/multi-attach/customize/multi-attach-customize-addons.test.ts",
		"integration/billing/update-subscription/custom-plan/update-paid-tier-behavior.test.ts",
		"integration/billing/update-subscription/invoice-line-items/update-quantity-line-items.test.ts",
		"integration/billing/stripe-webhooks/subscription-deleted/subscription-deleted-invoice-discounts.test.ts",
		"integration/billing/stripe-webhooks/invoice-created/invoice-created-consumable-discounts.test.ts",
		"integration/crud/customers/create-customer.test.ts",
		"integration/crud/customers/update-customer.test.ts",
		"integration/crud/customers/cross-version-list-customers.test.ts",
	],
};
