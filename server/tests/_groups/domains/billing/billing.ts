import type { TestGroup } from "../../types";

export const billing: TestGroup = {
	name: "billing",
	description:
		"All billing tests: legacy attach, migrations, v2 attach, update-subscription, stripe webhooks",
	tier: "domain",
	paths: [
		"legacy/attach",
		"migrations",
		"billing/attach",
		"billing/update-subscription",
		"stripe-webhooks",
	],
};
