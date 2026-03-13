import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Default product behavior verification tests",
	tier: "domain",
	paths: [
		// Cancel immediately with default tests

		"integration/billing/stripe-webhooks/subscription-deleted/subscription-deleted-invoice.test.ts",
		"integration/billing/attach/scheduled-switch/scheduled-switch-consumable.test.ts",
		"integration/billing/legacy/attach/invoice/legacy-attach-invoice-mode.test.ts",
		"integration/billing/legacy/attach/upgrade/legacy-upgrade-merged.test.ts",
		"integration/billing/legacy/attach/upgrade/legacy-upgrade-usage.test.ts",
		"integration/billing/migrations/migrate-trials.test.ts",
		"integration/billing/update-subscription/custom-plan/update-paid-basic.test.ts",
		"integration/billing/legacy/attach/new/legacy-new-merged.test.ts",
		"integration/billing/legacy/attach/update-quantity/legacy-update-quantity.test.ts",
		"integration/billing/migrations/migrate-free.test.ts",
		"integration/billing/migrations/migrate-states.test.ts",
		"integration/billing/update-subscription/cancel/uncancel/uncancel-combined.test.ts",
		"integration/billing/update-subscription/custom-plan/update-paid-prepaid.test.ts",
		"integration/billing/attach/invoice/attach-invoice-draft-deferred.test.ts",
		"integration/billing/legacy/attach/invoice/payment-failure/legacy-attach-payment-failed.test.ts",
		"integration/billing/setup-payment/setup-payment-with-customize.test.ts",
		"integration/billing/update-subscription/custom-plan/update-free-to-paid.test.ts",
		"integration/billing/update-subscription/free-trial/update-paid-trials.test.ts",
		"integration/billing/legacy/attach/checkout/legacy-checkout-basic.test.ts",
		"integration/billing/migrations/migrate-paid.test.ts",
		"integration/billing/multi-attach/checkout/multi-attach-checkout-basic.test.ts",
		"integration/billing/update-subscription/cancel/uncancel/uncancel-basic.test.ts",
		"integration/billing/update-subscription/custom-plan/update-paid-features.test.ts",
	],
};
