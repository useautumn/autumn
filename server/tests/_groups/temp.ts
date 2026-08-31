import type { TestGroup } from "./types";

/** Scratch group for tw leftovers. Keep empty on trunk. */
const activeTempPaths: string[] = [];

export const temp: TestGroup = {
	name: "temp",
	description: "local tw triage — keep empty on trunk",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 4,
};
