import type { TestGroup } from "../types";

export const coreMigrations: TestGroup = {
	name: "core-migrations",
	description: "Core migration tests",
	tier: "core",
	paths: [
		"migrations/migrate-free.test.ts",
		"migrations/migrate-paid.test.ts",
		"migrations/migrate-trials.test.ts",
		"migrations/migrate-states.test.ts",
	],
};
