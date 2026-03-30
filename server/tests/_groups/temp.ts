import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Overage allowed billing control tests",
	tier: "domain",
	paths: [
		"integration/balances/check/overage-allowed/",
		"integration/balances/track/overage-allowed/",
		"integration/crud/customers/customer-billing-controls.test.ts",
		"integration/crud/entities/update-entity-billing-controls.test.ts",
	],
};
