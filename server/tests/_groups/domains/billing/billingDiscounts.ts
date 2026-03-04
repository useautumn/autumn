import type { TestGroup } from "../../types";

export const billingDiscounts: TestGroup = {
	name: "discounts",
	description:
		"Discount tests: attach, immediate-switch, scheduled-switch, update-subscription, webhooks, unit",
	tier: "domain",
	paths: [
		"billing/attach/discounts",
		"billing/attach/immediate-switch/immediate-switch-discounts.test.ts",
		"billing/attach/invoice-line-items/line-item-discounts.test.ts",
		"billing/attach/scheduled-switch/discounts",
		"billing/update-subscription/discounts",
		"billing/stripe-webhooks/invoice-created/invoice-created-discounts.test.ts",
		"billing/stripe-webhooks/invoice-created/invoice-created-consumable-discounts.test.ts",
		"billing/stripe-webhooks/subscription-deleted/subscription-deleted-invoice-discounts.test.ts",
		"billing/legacy/attach/upgrade/legacy-upgrade-discount.test.ts",
		"unit/billing/stripe/discounts",
	],
};
