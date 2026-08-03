import type { TestGroup } from "./types";

// Add paths here while triaging a run, then clear them again.
const activeTempPaths: string[] = [
	"integration/billing/migrations-v2/controls/cancel/migration-cancel-batch.test.ts",
	"integration/billing/migrations-v2/batch-migrations/add-items/batch-add-items-row-pagination.test.ts",
	"integration/billing/migrations-v2/events/migration-events-basic.test.ts",
	"integration/billing/migrations-v2/lazy/lazy-run-disabled.test.ts",
	"integration/billing/migrations-v2/update-plan-version/migration-free-trial-carryover.test.ts",
	"integration/billing/migrations-v2/update-plan-version/migration-oneoff-addon-version.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "Scratch group for triaging a failing tw run",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 2,
};
