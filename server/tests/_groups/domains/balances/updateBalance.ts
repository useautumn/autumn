import type { TestGroup } from "../../types";

export const updateBalance: TestGroup = {
	name: "update-balance",
	description: "Balance update endpoint tests",
	tier: "domain",
	paths: ["integration/balances/update"],
};
