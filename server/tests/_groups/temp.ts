import type { TestGroup } from "./types";

// Triaging `bun tw` runs msemx2wl-pxulxf (core) + msenc7l6-rkeioi (balances)
// on dev @ ed7f56138 — non-chromium failures. Clear when triaged.
const activeTempPaths: string[] = [
	"balances/check/credit-systems/credit-systems3.test.ts",
	"balances/track/concurrency/concurrent-track5.test.ts",
	"balances/track/entity-balances/track-entity-balances6.test.ts",
	"balances/track/rollovers/track-rollover3.test.ts",
	"balances/track/rollovers/track-rollover4.test.ts",
	"balances/track/track-async.test.ts",
	"integration/balances/auto-topup/auto-topup-plan-price-scope.test.ts",
	"integration/balances/check/check-fallback.test.ts",
	"integration/balances/delete/delete-balance.test.ts",
	"integration/balances/legacy/legacy-set-usage.test.ts",
	"integration/balances/lock/check-with-lock-expiry.test.ts",
	"integration/balances/lock/entities/check-lock-entity-product.test.ts",
	"integration/balances/reset/list-entities-reset.test.ts",
	"integration/balances/track/basic/track-event-name.test.ts",
	"integration/balances/track/basic/track-paid-features-allocated-v2.test.ts",
	"integration/balances/track/basic/track-tokens-paid.test.ts",
	"integration/balances/track/track-tinybird-migration.test.ts",
	"integration/balances/usage-windows/plan-changes/plan-change-upgrade.test.ts",
	"integration/billing/create-schedule/phases/create-schedule-phases.test.ts",
	"integration/billing/legacy/attach/invoice/legacy-attach-invoice-mode.test.ts",
	"integration/billing/legacy/attach/new/legacy-new-oneoff-zero-decimal.test.ts",
	"integration/billing/legacy/attach/trial/legacy-trial.test.ts",
	"integration/billing/legacy/attach/update-quantity/legacy-update-quantity.test.ts",
	"integration/billing/legacy/attach/upgrade/legacy-upgrade-usage.test.ts",
	"integration/billing/stripe-webhooks/subscription-deleted/subscription-deleted-invoice.test.ts",
	"integration/billing/stripe-webhooks/subscription-updated/subscription-updated-uncancel.test.ts",
	"integration/billing/update-subscription/cancel/end-of-cycle/cancel-end-of-cycle.test.ts",
	"integration/billing/update-subscription/custom-plan/update-paid-intervals.test.ts",
	"integration/crud/plans/variants/core-contract.test.ts",
	"integration/licenses/billing/transitions/immediate-switch/base-price-transitions/base-price-transition-edge-cases.test.ts",
	"integration/licenses/billing/transitions/immediate-switch/base-price-transitions/update-base-price-transitions.test.ts",
	"integration/licenses/billing/update/update-license-quantity.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "Scratch group for triaging a failing tw run",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 2,
};
