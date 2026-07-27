import type { TestGroup } from "./types";

// Empty: everything from `bun tw --max=300` (run ms0mtl7z-xv6q4d) is resolved.
// Add paths here while triaging a run, then clear them again.
const activeTempPaths: string[] = [];

export const temp: TestGroup = {
	name: "temp",
	description: "Scratch group for triaging a failing tw run",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 2,
};
