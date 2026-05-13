import { finishLazyMigrationRun } from "./finishLazyMigrationRun.js";
import { withMigrationRunClaim } from "./withMigrationRunClaim.js";
import { withMigrationRunTracking } from "./withMigrationRunTracking.js";

export const migrationRunActions = {
	finishLazy: finishLazyMigrationRun,
	withClaim: withMigrationRunClaim,
	withTracking: withMigrationRunTracking,
} as const;

export {
	finishLazyMigrationRun,
	withMigrationRunClaim,
	withMigrationRunTracking,
};
