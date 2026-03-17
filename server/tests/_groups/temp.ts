import type { TestGroup } from "./types";

export const temp: TestGroup = {
	name: "temp",
	description: "Entity create/delete seat billing tests",
	tier: "domain",
	paths: [
		"integration/crud/entities/create-entity/create-entity-paid.test.ts",
		"integration/crud/entities/create-entity/create-entity-race.test.ts",
		"advanced/usageLimit/usageLimit1.test.ts",
	],
};
