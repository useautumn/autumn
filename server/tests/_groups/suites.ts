import type { TestSuite } from "./types";

export const suites: TestSuite[] = [
	{
		name: "pre-merge",
		description: "Run before merging any PR",
		groups: ["core"],
	},
	{
		name: "all-domain",
		description: "All domain-level test groups",
		groups: ["balances", "billing", "crud", "webhooks", "advanced", "misc"],
	},
];
