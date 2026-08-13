import { type Feature, isResettingEntitlement } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import { iterateCustomerProductPages } from "../../execute/customerProductPagination/iterateCustomerProductPages.js";
import type {
	BatchMigrationInsertedItem,
	BatchMigrationRemovedItem,
} from "../../execute/types/batchMigrationExecutionTypes.js";
import {
	BATCH_MIGRATION_CANDIDATE_ROW_BATCH,
	BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
} from "../../execute/utils/batchMigrationExecutionConstants.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "../../execute/utils/pagePhaseTimings.js";
import type { OperationScope } from "../../scope/operationScope.js";
import type { BatchMigrationExecutionLicenseOp } from "../../types/batchMigrationExecutionPlan.js";
import { replaceLicenseEntitlementsForPage } from "../replaceLicenseEntitlementsForPage/replaceLicenseEntitlementsForPage.js";
import { enrichAndInsertLicenseCandidates } from "./enrichAndInsertLicenseCandidates.js";
import { removeLicenseEntitlementRows } from "./removeLicenseEntitlementRows.js";
import { repointLicensePoolsForPage } from "./repointLicensePoolsForPage.js";
import { selectLicenseAddCandidateRows } from "./selectLicenseAddCandidateRows.js";

export type AddLicenseEntitlementsForPageResult = {
	affected: number;
	candidateCount: number;
	repointedPools: number;
	repointedInternalCustomerIds: string[];
	insertedItems: BatchMigrationInsertedItem[];
	removedItems: BatchMigrationRemovedItem[];
	excludedInternalCustomerIds: string[];
};

export const addLicenseEntitlementsForPage = async ({
	db,
	scope,
	internalCustomerIds,
	operation,
	now,
	features,
	phases,
	candidateRowBatchSize = BATCH_MIGRATION_CANDIDATE_ROW_BATCH,
}: {
	db: DrizzleCli;
	features: Feature[];
	scope: OperationScope;
	internalCustomerIds: string[];
	operation: BatchMigrationExecutionLicenseOp;
	now: number;
	phases?: BatchMigrationPagePhases;
	candidateRowBatchSize?: number;
}): Promise<AddLicenseEntitlementsForPageResult> => {
	const insertedItems: BatchMigrationInsertedItem[] = [];
	const excludedIds = new Set<string>();

	// Whole-page, so it commits before any candidate select reads the pool —
	// not per batch, which would mutate before the ceiling assertion.
	const repointed = await timePhase({
		phases,
		phase: "repoint",
		run: () =>
			withStatementTimeout(
				db,
				(transaction) =>
					repointLicensePoolsForPage({
						db: transaction,
						internalCustomerIds,
						scope,
						planLicenseId: operation.planLicenseId,
						licensePlanId: operation.licensePlanId,
					}),
				BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
			),
	});

	if (operation.kind === "remove") {
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
			affected: removed.rows,
			candidateCount: 0,
			repointedPools: repointed.pools,
			repointedInternalCustomerIds: [
				...repointed.internalCustomerIds,
				...removed.internalCustomerIds,
			],
			insertedItems: [],
			removedItems: removed.removedItems,
			excludedInternalCustomerIds: [],
		};
	}

	if (operation.kind === "replace") {
		const replaced = await replaceLicenseEntitlementsForPage({
			db,
			features,
			scope,
			internalCustomerIds,
			replace: operation,
			now,
			phases,
			candidateRowBatchSize,
		});
		return {
			affected: replaced.affected,
			candidateCount: replaced.insertedItems.length,
			repointedPools: repointed.pools,
			repointedInternalCustomerIds: [
				...repointed.internalCustomerIds,
				...replaced.replacedInternalCustomerIds,
			],
			insertedItems: replaced.insertedItems,
			removedItems: [],
			excludedInternalCustomerIds: replaced.excludedInternalCustomerIds,
		};
	}

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
					selectLicenseAddCandidateRows({
						db: transaction,
						internalCustomerIds,
						scope,
						entitlement: operation.entitlement,
						licensePlanId: operation.licensePlanId,
						afterCustomerProductId,
						limit,
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
		affected: insertedItems.length,
		candidateCount: rowCount,
		repointedPools: repointed.pools,
		repointedInternalCustomerIds: [...repointed.internalCustomerIds],
		insertedItems,
		removedItems: [],
		excludedInternalCustomerIds: [...excludedIds],
	};
};
