import type { TestGroup } from "../../types";

export const billingV2: TestGroup = {
	name: "billing-v2",
	description: "V2 billing tests: migrations, attach, update-subscription",
	tier: "domain",
	paths: [
		"migrations",
		"billing/attach",
		"billing/update-subscription",
		"billing/multi-attach",
		"billing/setup-payment",
	],
};
