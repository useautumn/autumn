import type { TestGroup } from "./types";

// Empty: `bun tw` run ms9cvy9y-lmwa4f is triaged.
// Add paths here while triaging a run, then clear them again.
const activeTempPaths: string[] = [];

export const temp: TestGroup = {
	name: "temp",
	description: "Scratch group for triaging a failing tw run",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 2,
};
