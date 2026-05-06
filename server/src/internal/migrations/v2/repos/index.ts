import { getMigration } from "./getMigration.js";
import { insertMigration } from "./insertMigration.js";
import { updateMigration } from "./updateMigration.js";

export const migrationRepo = {
	insert: insertMigration,
	get: getMigration,
	update: updateMigration,
};
