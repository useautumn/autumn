import type { TestGroup } from "../../types";

export const balances: TestGroup = {
	name: "balances",
	description: "All balance check, track, set-usage, update, and cron tests",
	tier: "domain",
	paths: ["balances", "integration/balances"],
};
