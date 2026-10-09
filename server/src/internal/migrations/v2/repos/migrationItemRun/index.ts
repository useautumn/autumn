import { claimMigrationItemRun } from "./claimMigrationItemRun.js";
import {
	getCustomerMigrationItemRun,
	getMigrationItemRun,
} from "./getMigrationItemRun.js";
import { listConvergedCustomerItemIds } from "./listConvergedCustomerItemIds.js";
import { listItemRunCountRows } from "./listItemRunCountRows.js";
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
import { settleLiveItemRunsForRun } from "./settleLiveItemRunsForRun.js";

export const migrationItemRunRepo = {
	claim: claimMigrationItemRun,
	get: getMigrationItemRun,
	getCustomer: getCustomerMigrationItemRun,
	getCounts: getMigrationItemRunCounts,
	listCountsByRun: listMigrationItemRunCountsByRun,
	listCountRows: listItemRunCountRows,
	listForItems: listMigrationItemRunsForItems,
	listConvergedCustomerIds: listConvergedCustomerItemIds,
	markSucceeded: markMigrationItemRunSucceeded,
	markSkipped: markMigrationItemRunSkipped,
	markFailed: markMigrationItemRunFailed,
	settleLiveForRun: settleLiveItemRunsForRun,
};

export type { MigrationItemRunClaimBehavior } from "./claimMigrationItemRun.js";
export type { MigrationItemRunCountRow } from "./listItemRunCountRows.js";
export type {
	MigrationItemRunCounts,
	MigrationItemRunCountsByRun,
} from "./listMigrationItemRunCountsByRun.js";
