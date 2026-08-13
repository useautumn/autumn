import { isResettingEntitlement } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { iterateCustomerProductPages } from "../../execute/customerProductPagination/iterateCustomerProductPages.js";
import type { BatchMigrationInsertedItem } from "../../execute/types/batchMigrationExecutionTypes.js";
import { BATCH_MIGRATION_CANDIDATE_ROW_BATCH } from "../../execute/utils/batchMigrationExecutionConstants.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "../../execute/utils/pagePhaseTimings.js";
import type { OperationScope } from "../../scope/operationScope.js";
import type { BatchMigrationAddLicenseEntitlementOp } from "../../types/batchMigrationOperations.js";
import type { LicenseOpPageResult } from "../licenseOpPageResult.js";
import { selectLicenseCandidateRows } from "../selectLicenseCandidateRows.js";
import { enrichAndInsertLicenseCandidates } from "./enrichAndInsertLicenseCandidates.js";

export type AddLicenseEntitlementsForPageResult = LicenseOpPageResult & {
	candidateCount: number;
};

export const addLicenseEntitlementsForPage = async ({
	db,
	scope,
	internalCustomerIds,
	operation,
	now,
	phases,
	candidateRowBatchSize = BATCH_MIGRATION_CANDIDATE_ROW_BATCH,
}: {
	db: DrizzleCli;
	scope: OperationScope;
	internalCustomerIds: string[];
	operation: BatchMigrationAddLicenseEntitlementOp;
	now: number;
	phases?: BatchMigrationPagePhases;
	candidateRowBatchSize?: number;
}): Promise<AddLicenseEntitlementsForPageResult> => {
	const insertedItems: BatchMigrationInsertedItem[] = [];
	const excludedIds = new Set<string>();
	const resetting = isResettingEntitlement({
		entitlement: operation.entitlement,
	});

	const { rowCount } = await iterateCustomerProductPages({
		db,
		pageSize: candidateRowBatchSize,
		executePage: async ({
			transaction,
			afterCustomerProductId,
			limit,
			assertWithinCeiling,
		}) => {
			const candidates = await timePhase({
				phases,
				phase: "candidates",
				run: () =>
					selectLicenseCandidateRows({
						db: transaction,
						internalCustomerIds,
						scope,
						entitlement: operation.entitlement,
						licensePlanId: operation.licensePlanId,
						afterCustomerProductId,
						limit,
						match: "add",
					}),
			});
			if (candidates.length === 0) return candidates;
			assertWithinCeiling(candidates.length);

			const { insertedItems: pageItems, excludedInternalCustomerIds } =
				await enrichAndInsertLicenseCandidates({
					db: transaction,
					candidates,
					scope,
					operation,
					resetting,
					now,
					phases,
				});
			for (const id of excludedInternalCustomerIds) excludedIds.add(id);
			insertedItems.push(...pageItems);

			return candidates;
		},
	});

	return {
		candidateCount: rowCount,
		insertedItems,
		removedItems: [],
		changedInternalCustomerIds: [],
		excludedInternalCustomerIds: [...excludedIds],
	};
};
