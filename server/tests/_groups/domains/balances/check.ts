import type { TestGroup } from "../../types";

export const check: TestGroup = {
	name: "check",
	description: "Balance check endpoint tests",
	tier: "domain",
	paths: ["balances/check", "integration/balances/check"],
};
