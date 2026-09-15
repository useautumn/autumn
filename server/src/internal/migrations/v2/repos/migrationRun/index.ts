import { insertMigrationRun } from "./insertMigrationRun.js";
import { listMigrationRuns } from "./listMigrationRuns.js";
import { listRunAllSummaries } from "./listRunAllSummaries.js";
import { updateMigrationRun } from "./updateMigrationRun.js";

export const migrationRunRepo = {
	insert: insertMigrationRun,
	list: listMigrationRuns,
	listRunAllSummaries,
	update: updateMigrationRun,
};

export type { MigrationRunAllSummary } from "./listRunAllSummaries.js";
