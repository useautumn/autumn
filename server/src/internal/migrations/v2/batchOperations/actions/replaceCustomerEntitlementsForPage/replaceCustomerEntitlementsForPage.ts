import {
	type Feature,
	type FullProductWithoutLicenses,
	isResettingEntitlement,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	computeCustomerEntitlementInitialState,
	computeCustomerEntitlementPatch,
} from "@/internal/billing/v2/actions/batchTransition/compute/operations/entitlementPriceOperations/computeCustomerEntitlementPatch.js";
import type { CustomerEntitlementPatch } from "@/internal/billing/v2/actions/batchTransition/types/entitlementPriceOperationTypes.js";
import { iterateCustomerProductPages } from "../../execute/customerProductPagination/iterateCustomerProductPages.js";
import type {
	BatchMigrationInsertedItem,
	BatchMigrationRemovedItem,
} from "../../execute/types/batchMigrationExecutionTypes.js";
import { BATCH_MIGRATION_CANDIDATE_ROW_BATCH } from "../../execute/utils/batchMigrationExecutionConstants.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "../../execute/utils/pagePhaseTimings.js";
import type { OperationScope } from "../../scope/operationScope.js";
import type { BatchMigrationExecutionReplace } from "../../types/batchMigrationExecutionPlan.js";
import { enrichCustomerEntitlementCycles } from "../../utils/enrichCustomerEntitlementCycles.js";
import { resolveRemovableEntitlementIds } from "../removeCustomerEntitlementsForPage/resolveRemovableEntitlementIds.js";
import { remainingAfterBalancePatch } from "../replaceLicenseEntitlementsForPage/remainingAfterBalancePatch.js";
import { applyReplacePatches, type ReplaceRow } from "./applyReplacePatches.js";
import { selectReplaceCandidateRows } from "./selectReplaceCandidateRows.js";

export type ReplaceCustomerEntitlementsForPageResult = {
	affected: number;
	candidateCount: number;
	changedInternalCustomerIds: string[];
	excludedInternalCustomerIds: string[];
	insertedItems: BatchMigrationInsertedItem[];
	removedItems: BatchMigrationRemovedItem[];
};

const toInsertedItem = ({
	row,
	planId,
	replace,
	customerEntitlementPatch,
}: {
	row: ReplaceRow;
	planId: string;
	replace: BatchMigrationExecutionReplace;
	customerEntitlementPatch: CustomerEntitlementPatch;
}): BatchMigrationInsertedItem => ({
	internalCustomerId: row.internalCustomerId,
	customerProductId: row.customerProductId,
	entityId: row.entityId,
	planId,
	featureId: replace.entitlement.feature.id,
	granted: replace.initialState.granted,
	remaining: remainingAfterBalancePatch({
		liveBalance: row.liveBalance,
		patch: customerEntitlementPatch,
	}),
	unlimited: replace.initialState.unlimited === true,
	nextResetAt: row.nextResetAt,
	status: row.status,
	startsAt: row.startsAt,
	canceledAt: row.canceledAt,
	endedAt: row.endedAt,
	trialEndsAt: row.trialEndsAt,
});

/** The from-half of the replace: the definition the row held plus its
 * pre-write balance state, so finalize can diff before → after honestly. */
const toRemovedItem = ({
	row,
	planId,
	replace,
}: {
	row: ReplaceRow;
	planId: string;
	replace: BatchMigrationExecutionReplace;
}): BatchMigrationRemovedItem => {
	const fromInitialState = computeCustomerEntitlementInitialState({
		entitlement: replace.fromEntitlement,
	});
	return {
		internalCustomerId: row.internalCustomerId,
		customerProductId: row.customerProductId,
		entityId: row.entityId,
		planId,
		featureId: replace.fromEntitlement.feature.id,
		entitlement: replace.fromEntitlement,
		granted: fromInitialState.granted,
		remaining: row.liveBalance,
		unlimited: fromInitialState.unlimited === true,
		nextResetAt: row.liveNextResetAt,
		status: row.status,
		startsAt: row.startsAt,
		canceledAt: row.canceledAt,
		endedAt: row.endedAt,
		trialEndsAt: row.trialEndsAt,
	};
};

/**
 * Replaces live rows whose definition matches the catalog from-entitlement
 * with the minted to-definition, carrying the consumed balance across.
 * Bounded per customer-product page like the add and remove actions.
 */
export const replaceCustomerEntitlementsForPage = async ({
	db,
	features,
	scope,
	internalCustomerIds,
	fromProduct,
	replace,
	now,
	phases,
	candidateRowBatchSize = BATCH_MIGRATION_CANDIDATE_ROW_BATCH,
}: {
	db: DrizzleCli;
	features: Feature[];
	scope: OperationScope;
	internalCustomerIds: string[];
	fromProduct: FullProductWithoutLicenses;
	replace: BatchMigrationExecutionReplace;
	now: number;
	phases?: BatchMigrationPagePhases;
	candidateRowBatchSize?: number;
}): Promise<ReplaceCustomerEntitlementsForPageResult> => {
	const toEntitlement = replace.entitlement;
	const resetting = isResettingEntitlement({ entitlement: toEntitlement });
	const excludedIds = new Set<string>();
	const replacedIds = new Set<string>();
	const insertedItems: BatchMigrationInsertedItem[] = [];
	const removedItems: BatchMigrationRemovedItem[] = [];

	// Resolved once per page: a customer can hold a custom or older-version
	// definition of the same item, which the catalog id alone would miss.
	// The to-id is excluded so replays never re-apply the balance patch.
	const fromEntitlementIds = (
		await timePhase({
			phases,
			phase: "distinct",
			run: () =>
				resolveRemovableEntitlementIds({
					db,
					features,
					internalCustomerIds,
					scope,
					entitlement: replace.fromEntitlement,
				}),
		})
	).filter((entitlementId) => entitlementId !== toEntitlement.id);

	const customerEntitlementPatch = computeCustomerEntitlementPatch({
		fromEntitlement: replace.fromEntitlement,
		toEntitlement,
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
					selectReplaceCandidateRows({
						db: transaction,
						internalCustomerIds,
						scope,
						entitlement: toEntitlement,
						fromEntitlementIds,
						includeAnchorSources: resetting,
						afterCustomerProductId,
						limit,
					}),
			});
			if (candidates.length === 0) return candidates;
			assertWithinCeiling(candidates.length);

			const { rows, excludedInternalCustomerIds } = resetting
				? enrichCustomerEntitlementCycles({
						candidates,
						entitlement: toEntitlement,
						now,
					})
				: {
						rows: candidates.map((candidate) => ({
							...candidate,
							resetCycleAnchor: null,
							nextResetAt: null,
						})),
						excludedInternalCustomerIds: [],
					};
			for (const id of excludedInternalCustomerIds) excludedIds.add(id);

			const patched = await timePhase({
				phases,
				phase: "replace",
				run: () =>
					applyReplacePatches({
						db: transaction,
						rows,
						scope,
						toEntitlement,
						customerEntitlementPatch,
					}),
			});
			const updatedIdSet = new Set(patched.updatedIds);
			for (const id of patched.internalCustomerIds) replacedIds.add(id);
			for (const row of rows) {
				if (!updatedIdSet.has(row.customerEntitlementId)) continue;
				removedItems.push(
					toRemovedItem({ row, planId: fromProduct.id, replace }),
				);
				insertedItems.push(
					toInsertedItem({
						row,
						planId: fromProduct.id,
						replace,
						customerEntitlementPatch,
					}),
				);
			}
			return candidates;
		},
	});

	return {
		affected: insertedItems.length,
		candidateCount: rowCount,
		changedInternalCustomerIds: [...replacedIds],
		excludedInternalCustomerIds: [...excludedIds],
		insertedItems,
		removedItems,
	};
};
