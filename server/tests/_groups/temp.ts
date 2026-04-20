import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Failed tests to triage and fix",
	tier: "domain",
	paths: [
		"integration/billing/update-subscription/free-trial/update-paid-trials.test.ts",
		"integration/billing/update-subscription/free-trial/update-paid-to-free-trials.test.ts",

		"integration/billing/legacy/attach/downgrade/legacy-downgrade-merged-clock.test.ts",
		"integration/billing/legacy/attach/downgrade/legacy-downgrade-merged-schedule.test.ts",
		"integration/billing/stripe-webhooks/subscription-updated/subscription-updated-uncancel.test.ts",
		"integration/billing/stripe-webhooks/subscription-updated/subscription-updated-past-due.test.ts",
		"integration/billing/stripe-webhooks/invoice-created/invoice-created-entity-consumable.test.ts",
	],
};
