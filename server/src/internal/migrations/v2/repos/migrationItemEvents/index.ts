import {
	insertMigrationItemEvent,
	insertMigrationItemEvents,
} from "./insertMigrationItemEvents.js";
import { listLatestMigrationItemEvents } from "./listLatestMigrationItemEvents.js";
import { listMigrationItemEvents } from "./listMigrationItemEvents.js";

export const migrationItemEventRepo = {
	insert: insertMigrationItemEvent,
	insertMany: insertMigrationItemEvents,
	list: listMigrationItemEvents,
	listLatest: listLatestMigrationItemEvents,
};
