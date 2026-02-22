import type { TestGroup } from "../types";

export const billing: TestGroup = {
	name: "billing",
	description:
		"All attach, upgrade, downgrade, checkout, invoice, subscription, and legacy billing tests",
	tier: "domain",
	paths: [],
};
