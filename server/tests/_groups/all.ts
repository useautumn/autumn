import type { TestGroup } from "./types";

/** ⚠️ EVERY .test.ts under server/tests, walked dynamically at resolve time —
 * new files are included automatically. Enormous; run with intent. */
export const all: TestGroup = {
	name: "all",
	description:
		"⚠️ every single .test.ts in the tree (dynamic) — the everything group",
	tier: "domain",
	paths: ["."],
};
