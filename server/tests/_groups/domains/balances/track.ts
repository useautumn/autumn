import type { TestGroup } from "../../types";

export const track: TestGroup = {
	name: "track",
	description: "Balance track endpoint tests",
	tier: "domain",
	paths: ["balances/track", "integration/balances/track"],
};
