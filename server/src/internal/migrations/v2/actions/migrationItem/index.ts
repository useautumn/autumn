import { withMigrationItemTracking } from "./withMigrationItemTracking.js";

export const migrationItemActions = {
	withTracking: withMigrationItemTracking,
} as const;

export { withMigrationItemTracking };
