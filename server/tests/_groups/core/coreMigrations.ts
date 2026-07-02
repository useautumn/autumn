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
		"integration/billing/migrations-v2/update-plan-operation/customize/update-plan-op-price.test.ts",
		"integration/billing/migrations-v2/update-plan-operation/customize/update-plan-op-scheduled-patch.test.ts",
		"integration/billing/migrations-v2/trial/migration-paid-recurring-trial-carryover.test.ts",
		"integration/billing/migrations-v2/update-plan-version/migration-free-trial-carryover.test.ts",
		"integration/billing/migrations-v2/one-off-prepaid-preserve/preserve-on-migration.test.ts",
		"integration/billing/migrations-v2/update-plan-operation/state-preservation/subscriptions/update-plan-op-states.test.ts",
	],
};
