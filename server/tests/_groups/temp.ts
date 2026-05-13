import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "failed retry tests",
	tier: "domain",
	paths: [
		"integration/billing/setup-payment/setup-payment-with-plan.test.ts",
		"integration/crud/customers/customer-processors.test.ts",
		"integration/crud/customers/get-customer-aggregated-balances.test.ts",
		"integration/billing/stripe-webhooks/subscription-updated/subscription-updated-past-due.test.ts",
		"integration/billing/stripe-webhooks/invoice-created/invoice-created-entity-consumable.test.ts",
	],
};
