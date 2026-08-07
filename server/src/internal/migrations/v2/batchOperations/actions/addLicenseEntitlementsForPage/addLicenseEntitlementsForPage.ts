import type { CusProductStatus } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";
import { iterateCustomerProductPages } from "../../execute/customerProductPagination/iterateCustomerProductPages.js";
import type { BatchMigrationInsertedItem } from "../../execute/types/batchMigrationExecutionTypes.js";
import { BATCH_MIGRATION_CANDIDATE_ROW_BATCH } from "../../execute/utils/batchMigrationExecutionConstants.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "../../execute/utils/pagePhaseTimings.js";
import type { OperationScope } from "../../scope/operationScope.js";
import type { BatchMigrationExecutionAddLicense } from "../../types/batchMigrationExecutionPlan.js";
import { insertLicenseCustomerEntitlementRows } from "./insertLicenseCustomerEntitlementRows.js";
import { repointLicensePoolsForPage } from "./repointLicensePoolsForPage.js";
import { selectLicenseAddCandidateRows } from "./selectLicenseAddCandidateRows.js";

export type AddLicenseEntitlementsForPageResult = {
	affected: number;
	candidateCount: number;
	repointedPools: number;
	insertedItems: BatchMigrationInsertedItem[];
};

/**
 * Points each matched parent's pool at the prepared link, then fans that
 * link's entitlement onto every live assignment under it. Non-resetting only,
 * so there are no cycles to resolve — the anchor ladder that governs owned
 * rows reads columns an assignment does not carry.
 *
 * The repoint shares the page transaction with the select that reads it: a
 * separate connection would not see the new plan_license_id.
 */
export const addLicenseEntitlementsForPage = async ({
	db,
	internalCustomerIds,
	scope,
	add,
	now,
	phases,
	candidateRowBatchSize = BATCH_MIGRATION_CANDIDATE_ROW_BATCH,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scope: OperationScope;
	add: BatchMigrationExecutionAddLicense;
	now: number;
	phases?: BatchMigrationPagePhases;
	candidateRowBatchSize?: number;
}): Promise<AddLicenseEntitlementsForPageResult> => {
	const insertedItems: BatchMigrationInsertedItem[] = [];
	let affected = 0;
	let repointedPools = 0;
	let repointed = false;

	const { rowCount } = await iterateCustomerProductPages({
		db,
		pageSize: candidateRowBatchSize,
		executePage: async ({
			transaction,
			afterCustomerProductId,
			limit,
			assertWithinCeiling,
		}) => {
			if (!repointed) {
				repointedPools = await timePhase({
					phases,
					phase: "insert",
					run: () =>
						repointLicensePoolsForPage({
							db: transaction,
							internalCustomerIds,
							scope,
							planLicenseId: add.planLicenseId,
							licenseInternalProductId: add.licenseInternalProductId,
						}),
				});
				repointed = true;
			}

			const candidates = await timePhase({
				phases,
				phase: "candidates",
				run: () =>
					selectLicenseAddCandidateRows({
						db: transaction,
						internalCustomerIds,
						scope,
						internalFeatureId: add.entitlement.internal_feature_id,
						afterCustomerProductId,
						limit,
					}),
			});
			if (candidates.length === 0) return candidates;
			assertWithinCeiling(candidates.length);

			const insertableRows = candidates.map((row) => ({
				...row,
				id: generateId("cus_ent"),
			}));
			const insertedIds = await timePhase({
				phases,
				phase: "insert",
				run: () =>
					insertLicenseCustomerEntitlementRows({
						db: transaction,
						rows: insertableRows,
						initialState: add.initialState,
						now,
					}),
			});

			const insertedIdSet = new Set(insertedIds);
			for (const row of insertableRows) {
				if (!insertedIdSet.has(row.id)) continue;
				insertedItems.push({
					internalCustomerId: row.internalCustomerId,
					customerProductId: row.customerProductId,
					entityId: row.entityId,
					planId: add.licensePlanId,
					featureId: row.featureId,
					granted: add.initialState.granted,
					unlimited: add.initialState.unlimited === true,
					nextResetAt: null,
					status: row.status as CusProductStatus,
					startsAt: row.startsAt,
					canceledAt: row.canceledAt,
					endedAt: row.endedAt,
					trialEndsAt: row.trialEndsAt,
				});
			}
			affected += insertedIds.length;
			return candidates;
		},
	});

	return {
		affected,
		candidateCount: rowCount,
		repointedPools,
		insertedItems,
	};
};
