import type { TestGroup } from "./types";

const activeTempPaths = [
	"integration/billing/update-subscription/custom-plan/update-paid-basic.test.ts",
	"integration/billing/update-subscription/custom-plan/update-free-to-paid.test.ts",
	"integration/billing/update-subscription/custom-plan/update-paid-features.test.ts",
	"integration/crud/customers/get-customer-aggregated-balances.test.ts",
	"integration/billing/autumn-webhooks/billing-updated/billing-updated-migration.test.ts",
	"integration/billing/stripe-webhooks/subscription-updated/subscription-updated-past-due.test.ts",
	"integration/billing/stripe-webhooks/invoice-created/invoice-created-entity-consumable.test.ts",
	"integration/billing/update-subscription/custom-plan/update-allocated-legacy-compat.test.ts",
	"integration/billing/preview/allocated-v2-preview.test.ts",
	"integration/billing/create-schedule/preview/create-schedule-allocated-v2-preview.test.ts",
	"integration/billing/attach/scheduled-switch/scheduled-switch-allocated-v2.test.ts",
	"unit/products/allocated-v2-proration.spec.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "allocated-v2 billing regression tests",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 2,
};
