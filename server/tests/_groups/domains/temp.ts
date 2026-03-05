import type { TestGroup } from "../types";

export const temp: TestGroup = {
	name: "temp",
	description: "Tests created in this current session",
	tier: "domain",
	paths: ["auto-topup"],
};
