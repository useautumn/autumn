import { insertMigrationRun } from "./insertMigrationRun.js";
import { listLatestRunAllStatuses } from "./listLatestRunAllStatuses.js";
import { listLatestRunsByKind } from "./listLatestRunsByKind.js";
import { listMigrationRuns } from "./listMigrationRuns.js";
import { updateMigrationRun } from "./updateMigrationRun.js";

export const migrationRunRepo = {
	insert: insertMigrationRun,
	list: listMigrationRuns,
	listLatestRunAllStatuses,
	listLatestByKind: listLatestRunsByKind,
	update: updateMigrationRun,
};

export type { MigrationRunWithKind } from "./listLatestRunsByKind.js";
