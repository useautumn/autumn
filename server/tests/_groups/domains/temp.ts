import type { TestGroup } from "../types";

export const temp: TestGroup = {
	name: "temp",
	description: "Tests created in this current session",
	tier: "domain",
	paths: [
		// Invoice line items tests
		"server/tests/integration/billing/attach/invoice-line-items/attach-line-items.test.ts",
		"server/tests/integration/billing/attach/invoice-line-items/invoice-deferred-line-items.test.ts",
		"server/tests/integration/billing/attach/invoice-line-items/line-item-discounts.test.ts",
		"server/tests/integration/billing/attach/invoice-line-items/renewal-line-items.test.ts",
		"server/tests/integration/billing/attach/invoice-line-items/stripe-checkout-line-items.test.ts",
		"server/tests/integration/billing/multi-attach/multi-attach-invoice-line-items.test.ts",
		"server/tests/integration/billing/update-subscription/invoice-line-items/update-quantity-line-items.test.ts",
		"server/tests/integration/billing/update-subscription/invoice-line-items/remove-trial-line-items.test.ts",

		// Allocated invoice tests
		"server/tests/integration/balances/track/allocated-invoice/allocated-invoice-advances.test.ts",
		"server/tests/integration/balances/track/allocated-invoice/allocated-invoice-payment-failure.test.ts",
		"server/tests/integration/balances/track/allocated-invoice/bill-immediate.test.ts",
		"server/tests/integration/balances/track/allocated-invoice/create-replaceables.test.ts",
		"server/tests/integration/balances/track/allocated-invoice/prorate-immediate.test.ts",
		"server/tests/integration/balances/track/allocated-invoice/prorate-next-cycle.test.ts",
	],
};
