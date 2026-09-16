import { insertMigrationRun } from "./insertMigrationRun.js";
import { listMigrationIdsWithRunAllStarted } from "./listMigrationIdsWithRunAllStarted.js";
import { listMigrationRuns } from "./listMigrationRuns.js";
import { updateMigrationRun } from "./updateMigrationRun.js";

export const migrationRunRepo = {
	insert: insertMigrationRun,
	list: listMigrationRuns,
	listIdsWithRunAllStarted: listMigrationIdsWithRunAllStarted,
	update: updateMigrationRun,
};
