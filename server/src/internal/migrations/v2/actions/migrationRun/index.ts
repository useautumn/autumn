import { finishLazyMigrationRun } from "./finishLazyMigrationRun.js";
import { settleLeftoverClaims } from "./settleLeftoverClaims.js";
import { withMigrationRunClaim } from "./withMigrationRunClaim.js";
import { withMigrationRunTracking } from "./withMigrationRunTracking.js";

export const migrationRunActions = {
	finishLazy: finishLazyMigrationRun,
	settleLeftoverClaims,
	withClaim: withMigrationRunClaim,
	withTracking: withMigrationRunTracking,
} as const;

export {
	finishLazyMigrationRun,
	settleLeftoverClaims,
	withMigrationRunClaim,
	withMigrationRunTracking,
};
