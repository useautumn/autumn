import {
	type EntitlementWithFeature,
	type Feature,
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
import type { BatchMigrationExecutionLicenseOp } from "../../types/batchMigrationExecutionPlan.js";
import { enrichCustomerEntitlementCycles } from "../../utils/enrichCustomerEntitlementCycles.js";
import { selectLicenseCandidateRows } from "../selectLicenseCandidateRows.js";
import {
	type LicenseReplaceRow,
	applyLicenseReplacePatches,
} from "./applyLicenseReplacePatches.js";
import { expandFromLicenseEntitlementIds } from "./expandFromLicenseEntitlementIds.js";
import { listDistinctLicenseEntitlementsForPage } from "./listDistinctLicenseEntitlementsForPage.js";
import { remainingAfterBalancePatch } from "./remainingAfterBalancePatch.js";

export type ReplaceLicenseEntitlementsForPageResult = {
	affected: number;
	distinctEntitlements: number;
	replacedInternalCustomerIds: string[];
	excludedInternalCustomerIds: string[];
	insertedItems: BatchMigrationInsertedItem[];
	removedItems: BatchMigrationRemovedItem[];
};

const emptyResult = ({
	distinctEntitlements,
}: {
	distinctEntitlements: number;
}): ReplaceLicenseEntitlementsForPageResult => ({
	affected: 0,
	distinctEntitlements,
	replacedInternalCustomerIds: [],
	excludedInternalCustomerIds: [],
	insertedItems: [],
	removedItems: [],
});

const toInsertedItem = ({
	row,
	replace,
	customerEntitlementPatch,
}: {
	row: LicenseReplaceRow;
	replace: Extract<BatchMigrationExecutionLicenseOp, { kind: "replace" }>;
	customerEntitlementPatch: CustomerEntitlementPatch;
}): BatchMigrationInsertedItem => ({
	internalCustomerId: row.internalCustomerId,
	customerProductId: row.customerProductId,
	entityId: row.entityId,
	planId: replace.licensePlanId,
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
	replace,
	fromEntitlement,
}: {
	row: LicenseReplaceRow;
	replace: Extract<BatchMigrationExecutionLicenseOp, { kind: "replace" }>;
	fromEntitlement: EntitlementWithFeature;
}): BatchMigrationRemovedItem => {
	const fromInitialState = computeCustomerEntitlementInitialState({
		entitlement: fromEntitlement,
	});
	return {
		internalCustomerId: row.internalCustomerId,
		customerProductId: row.customerProductId,
		entityId: row.entityId,
		planId: replace.licensePlanId,
		featureId: fromEntitlement.feature.id,
		entitlement: fromEntitlement,
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
 * Replaces live assignment entitlements whose definition matches the catalog
 * from-row. Same path as add — the rowset is the finalize payload.
 */
export const replaceLicenseEntitlementsForPage = async ({
	db,
	features,
	scope,
	internalCustomerIds,
	replace,
	now,
	phases,
	candidateRowBatchSize = BATCH_MIGRATION_CANDIDATE_ROW_BATCH,
	maxDistinctEntitlements,
}: {
	db: DrizzleCli;
	features: Feature[];
	scope: OperationScope;
	internalCustomerIds: string[];
	replace: Extract<BatchMigrationExecutionLicenseOp, { kind: "replace" }>;
	now: number;
	phases?: BatchMigrationPagePhases;
	candidateRowBatchSize?: number;
	maxDistinctEntitlements?: number;
}): Promise<ReplaceLicenseEntitlementsForPageResult> => {
	const toEntitlement = replace.entitlement;
	const excludedIds = new Set<string>();
	const replacedIds = new Set<string>();
	const insertedItems: BatchMigrationInsertedItem[] = [];
	const removedItems: BatchMigrationRemovedItem[] = [];
	const resetting = isResettingEntitlement({ entitlement: toEntitlement });

	const { distinct, fromEntitlement } = await timePhase({
		phases,
		phase: "distinct",
		run: () =>
			listDistinctLicenseEntitlementsForPage({
				db,
				features,
				internalCustomerIds,
				scope,
				licensePlanId: replace.licensePlanId,
				internalFeatureId: toEntitlement.internal_feature_id,
				fromEntitlementId: replace.fromEntitlementId,
				maxDistinctEntitlements,
			}),
	});

	const fromEntitlementIds = expandFromLicenseEntitlementIds({
		candidateOutgoingEntitlements: distinct,
		fromEntitlement,
		toEntitlementId: toEntitlement.id,
	});
	if (fromEntitlementIds.length === 0) {
		return emptyResult({ distinctEntitlements: distinct.length });
	}

	const customerEntitlementPatch = computeCustomerEntitlementPatch({
		fromEntitlement,
		toEntitlement,
	});

	await iterateCustomerProductPages({
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
						entitlement: toEntitlement,
						licensePlanId: replace.licensePlanId,
						afterCustomerProductId,
						limit,
						match: "replace",
						fromEntitlementIds,
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
					applyLicenseReplacePatches({
						db: transaction,
						rows,
						scope,
						toEntitlement,
						licensePlanId: replace.licensePlanId,
						customerEntitlementPatch,
					}),
			});
			const updatedIdSet = new Set(patched.updatedIds);
			for (const id of patched.internalCustomerIds) replacedIds.add(id);
			for (const row of rows) {
				if (!updatedIdSet.has(row.customerEntitlementId)) continue;
				removedItems.push(toRemovedItem({ row, replace, fromEntitlement }));
				insertedItems.push(
					toInsertedItem({ row, replace, customerEntitlementPatch }),
				);
			}
			return candidates;
		},
	});

	return {
		affected: insertedItems.length,
		distinctEntitlements: distinct.length,
		replacedInternalCustomerIds: [...replacedIds],
		excludedInternalCustomerIds: [...excludedIds],
		insertedItems,
		removedItems,
	};
};
