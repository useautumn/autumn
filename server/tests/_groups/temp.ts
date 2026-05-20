import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "failed retry tests",
	tier: "domain",
	paths: [
		"integration/billing/autumn-webhooks/billing-updated/billing-updated-attach.test.ts",
		"integration/billing/autumn-webhooks/billing-updated/billing-updated-multi-attach.test.ts",
		"integration/billing/autumn-webhooks/billing-updated/billing-updated-create-schedule.test.ts",
		"integration/billing/autumn-webhooks/billing-updated/billing-updated-update-subscription.test.ts",
		"integration/billing/autumn-webhooks/billing-updated/billing-updated-subscription-updated.test.ts",
		"integration/billing/autumn-webhooks/billing-updated/billing-updated-subscription-deleted.test.ts",
	],
};
