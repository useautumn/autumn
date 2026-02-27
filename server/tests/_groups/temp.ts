import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Entity prepaid test suite",
	tier: "domain",
	paths: [
		"tests/integration/billing/attach/scheduled-switch/scheduled-switch-prepaid-entities.test.ts",
		"tests/integration/billing/attach/new-plan/prepaid/attach-prepaid-entities.test.ts",
		"tests/integration/billing/attach/new-plan/prepaid/attach-prepaid-volume-entities.test.ts",
		"tests/integration/billing/attach/immediate-switch/immediate-switch-entities-prepaid-volume.test.ts",
		"tests/integration/billing/update-subscription/update-quantity/multi-entity-quantity.test.ts",
		"tests/integration/billing/update-subscription/update-quantity/multi-entity-quantity-proration.test.ts",
	],
};
