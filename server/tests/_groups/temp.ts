import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Failed tests from billing V2 run",
	tier: "domain",
	paths: [
		"integration/billing/attach/checkout/stripe-checkout/stripe-checkout-multi-interval.test.ts",
		"integration/billing/attach/checkout/stripe-checkout/stripe-checkout-one-off.test.ts",
		"integration/billing/attach/checkout/stripe-checkout/stripe-checkout-prepaid.test.ts",
		// "integration/billing/attach/errors/attach-custom-plan-errors.test.ts",
		// "integration/billing/attach/errors/stripe-checkout-errors.test.ts",
		// "integration/billing/attach/invoice/attach-invoice-draft-deferred.test.ts",
		// "integration/billing/attach/new-plan/prepaid/attach-prepaid-addon.test.ts",
		// "integration/billing/attach/new-plan/prepaid/attach-prepaid-volume-with-flat.test.ts",
		// "integration/billing/multi-attach/customize/multi-attach-customize-addons.test.ts",
		// "integration/billing/update-subscription/custom-plan/update-paid-tier-behavior.test.ts",
		// "integration/billing/update-subscription/invoice-line-items/update-quantity-line-items.test.ts",
	],
};
