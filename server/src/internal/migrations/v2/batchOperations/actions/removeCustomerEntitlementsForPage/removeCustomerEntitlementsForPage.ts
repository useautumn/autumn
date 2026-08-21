import type {
	Feature,
	FullProductWithoutLicenses,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { iterateCustomerProductPages } from "@/internal/migrations/v2/batchOperations/execute/customerProductPagination/index.js";
import type { BatchMigrationRemovedItem } from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";
import { BATCH_MIGRATION_CANDIDATE_ROW_BATCH } from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "@/internal/migrations/v2/batchOperations/execute/utils/pagePhaseTimings.js";
import type { OperationScope } from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import type { BatchMigrationExecutionRemove } from "@/internal/migrations/v2/batchOperations/types/index.js";
import { toRemovedItem } from "../utils/toRemovedItem.js";
import { deleteCustomerEntitlementRows } from "./deleteCustomerEntitlementRows.js";
import { selectRemoveCandidateRows } from "./selectRemoveCandidateRows.js";

export type RemoveCustomerEntitlementsForPageResult = {
	affected: number;
	candidateCount: number;
	removedItems: BatchMigrationRemovedItem[];
};

/** Bounded per customer-product page like the add, so a customer holding many
 * customer products never balloons a statement or a transaction. */
export const removeCustomerEntitlementsForPage = async ({
	db,
	features,
	scope,
	internalCustomerIds,
	fromProduct,
	remove,
	phases,
	candidateRowBatchSize = BATCH_MIGRATION_CANDIDATE_ROW_BATCH,
}: {
	db: DrizzleCli;
	features: Feature[];
	scope: OperationScope;
	internalCustomerIds: string[];
	fromProduct: FullProductWithoutLicenses;
	remove: BatchMigrationExecutionRemove;
	phases?: BatchMigrationPagePhases;
	candidateRowBatchSize?: number;
}): Promise<RemoveCustomerEntitlementsForPageResult> => {
	const removedItems: BatchMigrationRemovedItem[] = [];

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
					selectRemoveCandidateRows({
						db: transaction,
						internalCustomerIds,
						scope,
						filter: remove.from,
						features,
						afterCustomerProductId,
						limit,
					}),
			});
			if (candidates.length === 0) return candidates;
			assertWithinCeiling(candidates.length);

			const deletedIds = await timePhase({
				phases,
				phase: "remove",
				run: () =>
					deleteCustomerEntitlementRows({
						db: transaction,
						customerEntitlementIds: candidates.map(
							(row) => row.customerEntitlementId,
						),
						scope,
					}),
			});

			const deletedIdSet = new Set(deletedIds);
			for (const row of candidates) {
				if (!deletedIdSet.has(row.customerEntitlementId)) continue;
				const fromEntitlement = row.liveDefinition;
				if (!fromEntitlement) continue;
				removedItems.push(
					toRemovedItem({
						row,
						planId: fromProduct.id,
						fromEntitlement,
					}),
				);
			}
			return candidates;
		},
	});

	return {
		affected: removedItems.length,
		candidateCount: rowCount,
		removedItems,
	};
};
