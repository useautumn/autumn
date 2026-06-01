import type { TestGroup } from "./types";

const activeTempPaths = [
	"integration/billing/attach/free-trial/trial-basic.test.ts",
	"integration/billing/attach/free-trial/trial-conversion.test.ts",
	"integration/billing/attach/free-trial/trial-downgrade.test.ts",
	"integration/billing/attach/free-trial/trial-entity-upgrade.test.ts",
	"integration/billing/attach/free-trial/trial-merge.test.ts",
];

export const tempBacklogPhases = [
	[
		"unit/billing/setup-billing-cycle-anchor.spec.ts",
		"unit/billing/stripe-backdate-start-date-utils.spec.ts",
		"unit/billing/stripe/discounts/apply-stripe-discounts-to-line-items.spec.ts",
		"integration/billing/attach/params/start-date/starts-at-backdate.test.ts",
		"integration/billing/attach/params/start-date/starts-at-backdate-invoice.test.ts",
	],
	[
		"integration/billing/attach/params/start-date/starts-at-backdate-new-billing-subscription.test.ts",
		"integration/billing/attach/params/start-date/starts-at-backdate-scheduled-replacement.test.ts",
		"integration/billing/attach/params/start-date/starts-at-validation.test.ts",
		"integration/billing/attach/params/start-date/starts-at-scheduling.test.ts",
		"integration/billing/attach/params/start-date/starts-at-enable-plan-immediately.test.ts",
	],
	[
		"integration/billing/attach/new-plan/attach-paid.test.ts",
		"integration/billing/attach/new-plan/attach-addon.test.ts",
		"integration/billing/attach/new-plan/attach-entities.test.ts",
		"integration/billing/attach/new-plan/new-prepaid.test.ts",
		"integration/billing/attach/new-plan/prepaid",
	],
	[
		"integration/billing/attach/free-trial",
		"integration/billing/attach/free-trial/override",
		"integration/billing/attach/params/plan-schedule",
		"integration/billing/attach/params/billing-cycle-anchor",
		"integration/billing/attach/params/custom-plan/custom-plan-entity.test.ts",
	],
	[
		"integration/billing/attach/discounts",
		"integration/billing/attach/immediate-switch",
		"integration/billing/attach/scheduled-switch",
		"integration/billing/attach/checkout/stripe-checkout/stripe-checkout-entities.test.ts",
		"integration/billing/attach/checkout/stripe-checkout/stripe-checkout-multi-interval.test.ts",
	],
	[
		"integration/billing/attach/checkout/stripe-checkout/prepaid/stripe-checkout-prepaid-entities.test.ts",
		"integration/billing/attach/invoice/attach-invoice-finalized-immediate.test.ts",
		"integration/billing/attach/invoice/attach-invoice-draft-immediate.test.ts",
		"integration/billing/attach/invoice-line-items/backdate-line-items.test.ts",
		"integration/billing/attach/invoice-line-items/line-item-discounts.test.ts",
	],
	[
		"integration/billing/multi-attach/basic",
		"integration/billing/multi-attach/customize",
		"integration/billing/multi-attach/multi-attach-paid-features.test.ts",
		"integration/billing/multi-attach/multi-attach-multi-interval.test.ts",
		"integration/billing/multi-attach/multi-attach-invoice-line-items.test.ts",
	],
	[
		"integration/billing/multi-attach/scheduled-switch",
		"integration/billing/create-schedule/backdate/create-schedule-backdate.test.ts",
		"integration/billing/create-schedule/create-schedule-annual-proration.test.ts",
		"integration/billing/create-schedule/phases/create-schedule-phases.test.ts",
		"integration/billing/create-schedule/phases/create-schedule-phases-checkout.test.ts",
	],
	[
		"integration/billing/create-schedule/phases/create-schedule-phases-replacements.test.ts",
		"integration/billing/create-schedule/phases/create-schedule-phases-schedules.test.ts",
		"integration/billing/create-schedule/phases/create-schedule-phases-validation.test.ts",
		"integration/billing/create-schedule/params/create-schedule-enable-plan-immediately.test.ts",
		"integration/billing/create-schedule/params/create-schedule-customize.test.ts",
	],
	[
		"integration/billing/create-schedule/params/create-schedule-subscription-id.test.ts",
		"integration/billing/create-schedule/one-off-prepaid-preserve/preserve-on-schedule.test.ts",
		"integration/billing/update-subscription/billing-behavior/next-cycle-only.test.ts",
		"integration/billing/update-subscription/billing-behavior/next-cycle-only-cancel.test.ts",
		"integration/billing/update-subscription/discounts/proration-discount.test.ts",
	],
	[
		"integration/billing/update-subscription/discounts/discount-applies-to.test.ts",
		"integration/billing/update-subscription/discounts/multiple-discounts.test.ts",
		"integration/billing/update-subscription/free-trial",
		"integration/billing/update-subscription/params/billing-cycle-anchor/update-sub-anchor-reset-with-changes.test.ts",
		"integration/billing/update-subscription/params/billing-cycle-anchor/update-sub-anchor-reset-no-partial-refund.test.ts",
	],
	[
		"integration/billing/stripe-webhooks/invoice-created/invoice-created-multi-interval.test.ts",
	],
];

export const temp: TestGroup = {
	name: "temp",
	description:
		"active temp slice for starts_at and next-cycle preview regressions",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 2,
};
