import type { DrizzleCli } from "@/db/initDrizzle.js";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import type { RecordBatchMigrationChanges } from "../../execute/types/batchMigrationChanges.js";
import { BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS } from "../../execute/utils/batchMigrationExecutionConstants.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "../../execute/utils/pagePhaseTimings.js";
import type { OperationScope } from "../../scope/operationScope.js";
import type { BatchMigrationRepointLicensePoolOp } from "../../types/batchMigrationOperations.js";
import type { LicenseOpPageResult } from "../licenseOpPageResult.js";
import { repointLicensePoolRows } from "./repointLicensePoolRows.js";

export type RepointLicensePoolForPageResult = LicenseOpPageResult & {
	repointedPools: number;
};

/** Whole-page, so it commits before any candidate select reads the pool — not
 * per batch, which would mutate before the ceiling assertion. */
export const repointLicensePoolForPage = async ({
	db,
	recordChanges,
	scope,
	internalCustomerIds,
	operation,
	phases,
}: {
	db: DrizzleCli;
	recordChanges: RecordBatchMigrationChanges;
	scope: OperationScope;
	internalCustomerIds: string[];
	operation: BatchMigrationRepointLicensePoolOp;
	phases?: BatchMigrationPagePhases;
}): Promise<RepointLicensePoolForPageResult> => {
	const repointed = await timePhase({
		phases,
		phase: "repoint",
		run: () =>
			withStatementTimeout(
				db,
				async (transaction) => {
					const repointed = await repointLicensePoolRows({
						db: transaction,
						internalCustomerIds,
						scope,
						planLicenseId: operation.planLicenseId,
						licensePlanId: operation.licensePlanId,
					});
					await recordChanges({
						db: transaction,
						changes: {
							repointedPoolCustomerIds: [...repointed.internalCustomerIds],
						},
					});
					return repointed;
				},
				BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
				{ forceCustomPlan: true },
			),
	});

	return {
		repointedPools: repointed.pools,
		changedInternalCustomerIds: [...repointed.internalCustomerIds],
		insertedItems: [],
		removedItems: [],
		excludedInternalCustomerIds: [],
	};
};
