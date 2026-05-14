import { claimMigrationItemRun } from "./claimMigrationItemRun.js";
import {
	getCustomerMigrationItemRun,
	getMigrationItemRun,
} from "./getMigrationItemRun.js";
import {
	markMigrationItemRunFailed,
	markMigrationItemRunSkipped,
	markMigrationItemRunSucceeded,
} from "./markMigrationItemRun.js";

export const migrationItemRunRepo = {
	claim: claimMigrationItemRun,
	get: getMigrationItemRun,
	getCustomer: getCustomerMigrationItemRun,
	markSucceeded: markMigrationItemRunSucceeded,
	markSkipped: markMigrationItemRunSkipped,
	markFailed: markMigrationItemRunFailed,
};

export type { MigrationItemRunClaimBehavior } from "./claimMigrationItemRun.js";
