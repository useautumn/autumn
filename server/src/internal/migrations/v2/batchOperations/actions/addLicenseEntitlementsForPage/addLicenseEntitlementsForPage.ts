import { isResettingEntitlement } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import { iterateCustomerProductPages } from "../../execute/customerProductPagination/iterateCustomerProductPages.js";
import type { BatchMigrationInsertedItem } from "../../execute/types/batchMigrationExecutionTypes.js";
import {
	BATCH_MIGRATION_CANDIDATE_ROW_BATCH,
	BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
} from "../../execute/utils/batchMigrationExecutionConstants.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "../../execute/utils/pagePhaseTimings.js";
import type { OperationScope } from "../../scope/operationScope.js";
import type { BatchMigrationExecutionAddLicense } from "../../types/batchMigrationExecutionPlan.js";
import { carryLicenseEntitlementRows } from "./carryLicenseEntitlementRows.js";
import { enrichAndInsertLicenseCandidates } from "./enrichAndInsertLicenseCandidates.js";
import { repointLicensePoolsForPage } from "./repointLicensePoolsForPage.js";
import { selectLicenseAddCandidateRows } from "./selectLicenseAddCandidateRows.js";

export type AddLicenseEntitlementsForPageResult = {
	affected: number;
	candidateCount: number;
	repointedPools: number;
	/** Customers whose pool was repointed or whose assignments carried onto a
	 * new definition. They changed even when no assignment gained a row, so they
	 * must not be reported as skipped. */
	repointedInternalCustomerIds: string[];
	insertedItems: BatchMigrationInsertedItem[];
	/** Customers a cycle rung refused — routed to skipped, as the owned path does. */
	excludedInternalCustomerIds: string[];
};

/**
 * Points each matched parent's pool at the prepared link, then fans that
 * link's entitlement onto every live assignment under it, each resolving its
 * own reset cycle from the parent it bills with.
 */
export const addLicenseEntitlementsForPage = async ({
	db,
	scope,
	internalCustomerIds,
	add,
	now,
	phases,
	candidateRowBatchSize = BATCH_MIGRATION_CANDIDATE_ROW_BATCH,
}: {
	db: DrizzleCli;
	/** The patch's lowered row-level scope, applied to the pool's parent. */
	scope: OperationScope;
	internalCustomerIds: string[];
	add: BatchMigrationExecutionAddLicense;
	now: number;
	phases?: BatchMigrationPagePhases;
	candidateRowBatchSize?: number;
}): Promise<AddLicenseEntitlementsForPageResult> => {
	const insertedItems: BatchMigrationInsertedItem[] = [];
	const excludedIds = new Set<string>();
	const resetting = isResettingEntitlement({ entitlement: add.entitlement });

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
						planLicenseId: add.planLicenseId,
						licenseInternalProductId: add.licenseInternalProductId,
					}),
				BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
			),
	});

	const carryFromEntitlementId = add.carryFromEntitlementId;
	const carried = carryFromEntitlementId
		? await timePhase({
				phases,
				phase: "carry",
				run: () =>
					withStatementTimeout(
						db,
						(transaction) =>
							carryLicenseEntitlementRows({
								db: transaction,
								internalCustomerIds,
								scope,
								fromEntitlementId: carryFromEntitlementId,
								toEntitlementId: add.entitlement.id,
								licenseInternalProductId: add.licenseInternalProductId,
								initialState: add.initialState,
							}),
						BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
					),
			})
		: { rows: 0, internalCustomerIds: [] };

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
						entitlement: add.entitlement,
						licenseInternalProductId: add.licenseInternalProductId,
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
					add,
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
		affected: insertedItems.length + carried.rows,
		candidateCount: rowCount,
		repointedPools: repointed.pools,
		repointedInternalCustomerIds: [
			...repointed.internalCustomerIds,
			...carried.internalCustomerIds,
		],
		insertedItems,
		excludedInternalCustomerIds: [...excludedIds],
	};
};
