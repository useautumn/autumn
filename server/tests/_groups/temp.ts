import type { TestGroup } from "./types";

const activeTempPaths: string[] = [
	"integration/billing/stripe-webhooks/invoice-created/invoice-created-per-entity-consumable.test.ts",
	"integration/billing/stripe-webhooks/invoice-created/invoice-created-per-entity-consumable-advanced.test.ts",
	"integration/billing/update-subscription/cancel/immediately/cancel-immediately-billing.test.ts",
	"integration/crud/plans/variants/stripe-resource-carryover.test.ts",
	"integration/billing/stripe-webhooks/invoice-created/invoice-created-consumable-trial.test.ts",
	"integration/balances/update/usage/allocated/update-usage-paid-allocated.test.ts",
	"integration/billing/pooled-balances/update/customize-pooled-balance.test.ts",
	"integration/billing/stripe-webhooks/subscription-deleted/subscription-deleted-invoice-discounts.test.ts",
	"integration/licenses/billing/discounts/license-discount-composition.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "local tw triage — keep empty on trunk",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 4,
};
