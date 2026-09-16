import { insertMigrationRun } from "./insertMigrationRun.js";
import { listMigrationIdsWithStartedRunAll } from "./listMigrationIdsWithStartedRunAll.js";
import { listMigrationRuns } from "./listMigrationRuns.js";
import { updateMigrationRun } from "./updateMigrationRun.js";

export const migrationRunRepo = {
	insert: insertMigrationRun,
	list: listMigrationRuns,
	listIdsWithStartedRunAll: listMigrationIdsWithStartedRunAll,
	update: updateMigrationRun,
};
