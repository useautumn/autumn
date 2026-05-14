import { deleteMigration } from "./deleteMigration.js";
import { findMigration } from "./findMigration.js";
import { getMigration } from "./getMigration.js";
import { insertMigration } from "./insertMigration.js";
import { updateMigration } from "./updateMigration.js";

export { migrationItemEventRepo } from "./migrationItemEvents/index.js";
export type { MigrationItemRunClaimBehavior } from "./migrationItemRun/index.js";
export { migrationItemRunRepo } from "./migrationItemRun/index.js";
export { migrationRunRepo } from "./migrationRun/index.js";

export const migrationRepo = {
	insert: insertMigration,
	get: getMigration,
	find: findMigration,
	update: updateMigration,
	delete: deleteMigration,
};
