import { finishLazyMigrationRun } from "./finishLazyMigrationRun.js";
import { reconcileAbandonedRuns } from "./reconcileAbandonedRuns.js";
import { settleLeftoverClaims } from "./settleLeftoverClaims.js";
import { withMigrationRunClaim } from "./withMigrationRunClaim.js";
import { withMigrationRunTracking } from "./withMigrationRunTracking.js";

export const migrationRunActions = {
	finishLazy: finishLazyMigrationRun,
	reconcileAbandoned: reconcileAbandonedRuns,
	settleLeftoverClaims,
	withClaim: withMigrationRunClaim,
	withTracking: withMigrationRunTracking,
} as const;

export {
	finishLazyMigrationRun,
	reconcileAbandonedRuns,
	settleLeftoverClaims,
	withMigrationRunClaim,
	withMigrationRunTracking,
};
