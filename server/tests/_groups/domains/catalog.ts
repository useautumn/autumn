import type { TestGroup } from "../types";

export const catalog: TestGroup = {
	name: "catalog",
	description:
		"Full catalog suite: catalogV2 plus legacy plans CRUD and catalog-v1",
	tier: "domain",
	paths: [
		// ── catalogV2 (current) ──
		"integration/catalog-v2",

		// ── Legacy plans CRUD (may be removed in the future) ──
		"integration/crud/plans",

		// ── catalog-v1 (may be removed in the future) ──
		"integration/crud/catalog",
	],
};
