import type { TestGroup } from "../../types";

export const prepaidVolume: TestGroup = {
	name: "prepaid-volume",
	description: "Prepaid volume-based tier pricing tests",
	tier: "domain",
	paths: [
		"unit/billing/invoicing/line-item-utils/volume-tiers-to-line-amount.test.ts",
		"unit/billing/invoicing/line-item-utils/tiers-to-line-amount.test.ts",
		"integration/billing/attach/new-plan/attach-prepaid-volume.test.ts",
		"integration/billing/attach/new-plan/attach-prepaid-volume-entities.test.ts",
		"integration/billing/attach/new-plan/new-prepaid.test.ts",
		"integration/billing/attach/immediate-switch/immediate-switch-prepaid-volume.test.ts",
		"integration/billing/attach/immediate-switch/immediate-switch-entities-prepaid-volume.test.ts",
		"integration/billing/attach/scheduled-switch/scheduled-switch-prepaid-volume.test.ts",
		"integration/billing/attach/edge-cases/v1-v2-compatibility/prepaid/attach-prepaid-volume-edge-cases.test.ts",
		"integration/billing/attach/checkout/stripe-checkout/stripe-checkout-prepaid.test.ts",
		"integration/billing/update-subscription/update-quantity/volume-tiers-update-quantity.test.ts",
		"integration/billing/update-subscription/custom-plan/update-paid-tier-behavior.test.ts",
		"integration/billing/legacy/attach/new/legacy-new-volume.test.ts",
		"integration/crud/plans/create-plan-advanced.test.ts",
		"integration/crud/plans/get-plan-advanced.test.ts",
		"integration/balances/check/check-prepaid.test.ts",
		"integration/balances/check/check-balance-price.test.ts",
		"integration/billing/attach/v2-params/v2-customize.test.ts",
	],
};
