import type { MigrationRun } from "@autumn/shared";
import type { MigrationRunWithKind } from "../../../repos/migrationRun/index.js";

export type MigrationRunState = {
	orgActiveRuns: MigrationRun[];
	latestRuns: MigrationRunWithKind[];
};
