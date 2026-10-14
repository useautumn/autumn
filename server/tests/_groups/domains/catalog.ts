import type { TestGroup } from "../types";

export const catalog: TestGroup = {
	name: "catalog",
	description:
		"Full catalog suite: catalogV2 plus legacy plans CRUD and catalog-v1",
	tier: "domain",
	paths: [
		"integration/catalog-v2",

		"integration/crud/plans",

		"integration/crud/catalog",
	],
};
