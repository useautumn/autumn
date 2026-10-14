import type { TestGroup } from "./types";

export const all: TestGroup = {
	name: "all",
	description:
		"⚠️ every single .test.ts in the tree (dynamic) — the everything group",
	tier: "domain",
	paths: ["."],
};
