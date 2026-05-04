import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Billing rollover regression suite (rollover carry-over fix)",
	tier: "domain",
	paths: ["_temp/volume-tiers-inspect.test.ts"],
};
