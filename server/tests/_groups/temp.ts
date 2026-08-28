import type { TestGroup } from "./types";

/** Local-confirmed leftovers from tw mtbqh66d-qn7c1r (2026-08-27) — cleared. */
const activeTempPaths: string[] = [];

export const temp: TestGroup = {
	name: "temp",
	description: "tw failures 2026-08-27 — product bugs only",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 4,
};
