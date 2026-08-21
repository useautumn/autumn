import type { TestGroup } from "./types";

const activeTempPaths: string[] = [
	"integration/billing/migrations-v2/batch-migrations/version-repoint/parity/version-repoint-parity-trial.test.ts",
	"integration/billing/migrations-v2/batch-migrations/version-repoint/parity/version-repoint-parity-add-remove-replace.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "This round: parity-trial + parity-add-remove-replace",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 2,
};
