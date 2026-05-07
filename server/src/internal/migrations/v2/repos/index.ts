import { deleteMigration } from "./deleteMigration.js";
import { findMigration } from "./findMigration.js";
import { getMigration } from "./getMigration.js";
import { insertMigration } from "./insertMigration.js";
import { updateMigration } from "./updateMigration.js";

export const migrationRepo = {
	insert: insertMigration,
	get: getMigration,
	find: findMigration,
	update: updateMigration,
	delete: deleteMigration,
};
