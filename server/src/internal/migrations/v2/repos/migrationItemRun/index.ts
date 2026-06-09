import { claimMigrationItemRun } from "./claimMigrationItemRun.js";
import {
	getCustomerMigrationItemRun,
	getMigrationItemRun,
} from "./getMigrationItemRun.js";
import {
	getMigrationItemRunCounts,
	listMigrationItemRunCountsByRun,
} from "./listMigrationItemRunCountsByRun.js";
import { listMigrationItemRunsForItems } from "./listMigrationItemRunsForItems.js";
import {
	markMigrationItemRunFailed,
	markMigrationItemRunSkipped,
	markMigrationItemRunSucceeded,
} from "./markMigrationItemRun.js";

export const migrationItemRunRepo = {
	claim: claimMigrationItemRun,
	get: getMigrationItemRun,
	getCustomer: getCustomerMigrationItemRun,
	getCounts: getMigrationItemRunCounts,
	listCountsByRun: listMigrationItemRunCountsByRun,
	listForItems: listMigrationItemRunsForItems,
	markSucceeded: markMigrationItemRunSucceeded,
	markSkipped: markMigrationItemRunSkipped,
	markFailed: markMigrationItemRunFailed,
};

export type { MigrationItemRunClaimBehavior } from "./claimMigrationItemRun.js";
export type {
	MigrationItemRunCounts,
	MigrationItemRunCountsByRun,
} from "./listMigrationItemRunCountsByRun.js";
