import type { Feature } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
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
	features,
	scope,
	internalCustomerIds,
	operation,
	phases,
}: {
	db: DrizzleCli;
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
				(transaction) =>
					removeLicenseEntitlementRows({
						db: transaction,
						internalCustomerIds,
						scope,
						filter: operation.filter,
						licensePlanId: operation.licensePlanId,
						features,
					}),
				BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
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
