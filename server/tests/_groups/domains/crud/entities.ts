import type { TestGroup } from "../../types";

export const entities: TestGroup = {
	name: "entities",
	description: "Entity CRUD endpoint tests",
	tier: "domain",
	paths: ["integration/crud/entities"],
};
