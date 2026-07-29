import type { TestGroup } from "../types";

export const corePlansCrud: TestGroup = {
	name: "core-plans-crud",
	description: "Complete plans CRUD coverage",
	tier: "core",
	paths: ["integration/crud/plans"],
};
