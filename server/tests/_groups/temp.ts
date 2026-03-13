import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Default product behavior verification tests",
	tier: "domain",
	paths: [
		// Cancel immediately with default tests

		"attach/carry-over-balances",
		"attach/carry-over-usages",
	],
};
