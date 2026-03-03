import type { TestGroup } from "../../types";

export const billingV2Misc: TestGroup = {
	name: "billing-v2-misc",
	description: "V2 billing tests: migrations, attach, update-subscription",
	tier: "domain",
	paths: [
		"billing/migrations",
		"billing/stripe-webhooks",
		"billing/autumn-webhooks",
		"crud/customers",
		"cron",
	],
};
