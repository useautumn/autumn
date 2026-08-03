import type { TestGroup } from "../../types";

export const customers: TestGroup = {
	name: "customers",
	description: "Customer CRUD endpoint tests",
	tier: "domain",
	paths: ["integration/crud/customers"],
};
