import type { TestGroup } from "./types";

/** Local-confirmed product bugs from tw mtbqh66d-qn7c1r (2026-08-27). */
const activeTempPaths: string[] = [
	"integration/balances/track/basic/track-graduated-credit-system.test.ts",
	"integration/balances/track/basic/track-invoice-credit-attribution.test.ts",
	"integration/billing/legacy/attach/upgrade/legacy-upgrade.test.ts",
	"integration/billing/stripe-webhooks/subscription-created/licenses/sub-created-parent-product-license-backsync.test.ts",
	"integration/billing/stripe-webhooks/subscription-created/sub-created-keyed-usage-addon.test.ts",
	"integration/billing/stripe-webhooks/subscription-updated/sub-updated-keyed-usage-addon.test.ts",
	"integration/billing/update-subscription/billing-behavior/next-cycle-only.test.ts",
	"integration/billing/update-subscription/cancel/end-of-cycle/cancel-end-of-cycle.test.ts",
	"integration/billing/update-subscription/cancel/uncancel/uncancel-combined.test.ts",
	"integration/billing/update-subscription/free-trial/update-quantity-with-trial.test.ts",
	"integration/catalog-v2/plans/update/stripe-price-immutability.test.ts",
	"integration/catalog-v2/plans/update/update-plan-free-trial.test.ts",
	"integration/crud/plans/variants/rollover-disambiguation.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "tw failures 2026-08-27 — product bugs only",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 4,
};
