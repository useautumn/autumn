import type { TestGroup } from "../types";

export const licenses: TestGroup = {
	name: "licenses",
	description: "License catalog, billing, assignment, and lifecycle coverage",
	tier: "domain",
	paths: ["integration/licenses"],
};
