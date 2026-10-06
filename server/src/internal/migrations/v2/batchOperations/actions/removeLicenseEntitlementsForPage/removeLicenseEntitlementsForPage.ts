import type { Feature } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { RecordBatchMigrationChanges } from "../../execute/types/batchMigrationChanges.js";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import { BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS } from "../../execute/utils/batchMigrationExecutionConstants.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "../../execute/utils/pagePhaseTimings.js";
import type { OperationScope } from "../../scope/operationScope.js";
import type { BatchMigrationRemoveLicenseEntitlementOp } from "../../types/batchMigrationOperations.js";
import type { LicenseOpPageResult } from "../licenseOpPageResult.js";
import { removeLicenseEntitlementRows } from "./removeLicenseEntitlementRows.js";

export type RemoveLicenseEntitlementsForPageResult = LicenseOpPageResult & {
	removedRows: number;
};

export const removeLicenseEntitlementsForPage = async ({
	db,
	recordChanges,
	features,
	scope,
	internalCustomerIds,
	operation,
	phases,
}: {
	db: DrizzleCli;
	recordChanges: RecordBatchMigrationChanges;
	features: Feature[];
	scope: OperationScope;
	internalCustomerIds: string[];
	operation: BatchMigrationRemoveLicenseEntitlementOp;
	phases?: BatchMigrationPagePhases;
}): Promise<RemoveLicenseEntitlementsForPageResult> => {
	const removed = await timePhase({
		phases,
		phase: "remove",
		run: () =>
			withStatementTimeout(
				db,
				async (transaction) => {
					const removed = await removeLicenseEntitlementRows({
						db: transaction,
						internalCustomerIds,
						scope,
						filter: operation.filter,
						licensePlanId: operation.licensePlanId,
						features,
					});
					await recordChanges({
						db: transaction,
						changes: { removedItems: removed.removedItems },
					});
					return removed;
				},
				BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
				{ forceCustomPlan: true },
			),
	});

	return {
		removedRows: removed.rows,
		changedInternalCustomerIds: [...removed.internalCustomerIds],
		insertedItems: [],
		removedItems: removed.removedItems,
		excludedInternalCustomerIds: [],
	};
};
