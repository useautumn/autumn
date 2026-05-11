import {
	withMigrationItemEvents,
	withMigrationItemTracking,
} from "./withMigrationItemTracking.js";

export const migrationItemActions = {
	withEvents: withMigrationItemEvents,
	withTracking: withMigrationItemTracking,
} as const;

export { withMigrationItemEvents, withMigrationItemTracking };
