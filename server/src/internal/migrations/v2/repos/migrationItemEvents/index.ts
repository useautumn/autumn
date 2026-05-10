import {
	insertMigrationItemEvent,
	insertMigrationItemEvents,
} from "./insertMigrationItemEvents.js";
import { listMigrationItemEvents } from "./listMigrationItemEvents.js";

export const migrationItemEventRepo = {
	insert: insertMigrationItemEvent,
	insertMany: insertMigrationItemEvents,
	list: listMigrationItemEvents,
};
