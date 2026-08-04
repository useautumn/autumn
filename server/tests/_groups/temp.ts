import type { TestGroup } from "./types";

// Triaging `bun tw core` run msekjw6t-o830a9 (ref dev @ 9ef5e5b5b) — 31
// failing file(s). Add paths here while triaging a run, then clear them again.
const activeTempPaths: string[] = [
	"balances/track/entity-balances/track-entity-balances6.test.ts",
	"integration/balances/track/basic/track-event-name.test.ts",
	"integration/billing/attach/checkout/stripe-checkout/stripe-checkout-basic.test.ts",
	"integration/billing/attach/invoice/attach-invoice-draft-deferred.test.ts",
	"integration/billing/attach/invoice/payment-failure/payment-failed.test.ts",
	"integration/billing/create-schedule/phases/create-schedule-phases.test.ts",
	"integration/billing/legacy/attach/checkout/legacy-checkout-basic.test.ts",
	"integration/billing/legacy/attach/invoice/legacy-attach-invoice-mode.test.ts",
	"integration/billing/legacy/attach/invoice/payment-failure/legacy-attach-payment-failed.test.ts",
	"integration/billing/legacy/attach/new/legacy-new-oneoff-zero-decimal.test.ts",
	"integration/billing/legacy/attach/trial/legacy-trial.test.ts",
	"integration/billing/legacy/attach/upgrade/legacy-upgrade-usage.test.ts",
	"integration/billing/multi-attach/checkout/multi-attach-checkout-basic.test.ts",
	"integration/billing/pooled-balances/checkout/pooled-balance-checkout-attach.test.ts",
	"integration/billing/setup-payment/setup-payment-no-plan.test.ts",
	"integration/billing/setup-payment/setup-payment-with-customize.test.ts",
	"integration/billing/setup-payment/setup-payment-with-plan.test.ts",
	"integration/billing/stripe-webhooks/subscription-created/sub-created-auto-sync.test.ts",
	"integration/billing/stripe-webhooks/subscription-created/sub-created-checkout-session-guard.test.ts",
	"integration/billing/stripe-webhooks/subscription-created/sub-created-skip-sync.test.ts",
	"integration/billing/stripe-webhooks/subscription-deleted/subscription-deleted-invoice.test.ts",
	"integration/billing/stripe-webhooks/subscription-updated/subscription-updated-uncancel.test.ts",
	"integration/billing/update-subscription/cancel/end-of-cycle/cancel-end-of-cycle.test.ts",
	"integration/billing/update-subscription/custom-plan/update-paid-basic.test.ts",
	"integration/billing/update-subscription/custom-plan/update-paid-prepaid.test.ts",
	"integration/billing/update-subscription/params/recalculate-balances/update-quantity-prepaid-overage.test.ts",
	"integration/crud/plans/variants/core-contract.test.ts",
	"integration/licenses/billing/checkout/stripe-checkout-license-quantity.test.ts",
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
