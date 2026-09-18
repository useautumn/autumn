import { attachItemRunCounts } from "./attachItemRunCounts.js";
import { finishLazyMigrationRun } from "./finishLazyMigrationRun.js";
import { reconcileAbandonedRuns } from "./reconcileAbandonedRuns.js";
import { reconcileAbandonedRunsOnce } from "./reconcileAbandonedRunsOnce.js";
import { settleLeftoverClaims } from "./settleLeftoverClaims.js";
import { withMigrationRunClaim } from "./withMigrationRunClaim.js";
import { withMigrationRunTracking } from "./withMigrationRunTracking.js";

export const migrationRunActions = {
	attachItemRunCounts,
	finishLazy: finishLazyMigrationRun,
	reconcileAbandoned: reconcileAbandonedRuns,
	reconcileAbandonedOnce: reconcileAbandonedRunsOnce,
	settleLeftoverClaims,
	withClaim: withMigrationRunClaim,
	withTracking: withMigrationRunTracking,
} as const;

export {
	attachItemRunCounts,
	finishLazyMigrationRun,
	reconcileAbandonedRuns,
	reconcileAbandonedRunsOnce,
	settleLeftoverClaims,
	withMigrationRunClaim,
	withMigrationRunTracking,
};
