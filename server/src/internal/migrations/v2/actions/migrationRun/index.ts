import { withMigrationRunClaim } from "./withMigrationRunClaim.js";
import { withMigrationRunTracking } from "./withMigrationRunTracking.js";

export const migrationRunActions = {
	withClaim: withMigrationRunClaim,
	withTracking: withMigrationRunTracking,
} as const;

export { withMigrationRunClaim, withMigrationRunTracking };
