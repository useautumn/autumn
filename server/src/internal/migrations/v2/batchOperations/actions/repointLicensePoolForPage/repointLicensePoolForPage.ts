import type { DrizzleCli } from "@/db/initDrizzle.js";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
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
	scope,
	internalCustomerIds,
	operation,
	phases,
}: {
	db: DrizzleCli;
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
				(transaction) =>
					repointLicensePoolRows({
						db: transaction,
						internalCustomerIds,
						scope,
						planLicenseId: operation.planLicenseId,
						licensePlanId: operation.licensePlanId,
					}),
				BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
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
