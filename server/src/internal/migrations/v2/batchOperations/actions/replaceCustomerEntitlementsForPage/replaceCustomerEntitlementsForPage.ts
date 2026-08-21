import {
	type Feature,
	type FullProductWithoutLicenses,
	isResettingEntitlement,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { CustomerEntitlementPatch } from "@/internal/billing/v2/actions/batchTransition/types/entitlementPriceOperationTypes.js";
import { iterateCustomerProductPages } from "../../execute/customerProductPagination/iterateCustomerProductPages.js";
import type {
	BatchMigrationInsertedItem,
	BatchMigrationRemovedItem,
} from "../../execute/types/batchMigrationExecutionTypes.js";
import {
	BATCH_MIGRATION_CANDIDATE_ROW_BATCH,
	BATCH_MIGRATION_PATCH_GROUP_CONCURRENCY,
} from "../../execute/utils/batchMigrationExecutionConstants.js";
import { mapWithConcurrency } from "../../execute/utils/mapWithConcurrency.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "../../execute/utils/pagePhaseTimings.js";
import type { OperationScope } from "../../scope/operationScope.js";
import type { BatchMigrationExecutionReplace } from "../../types/batchMigrationExecutionPlan.js";
import { enrichCustomerEntitlementCycles } from "../../utils/enrichCustomerEntitlementCycles.js";
import { remainingAfterBalancePatch } from "../replaceLicenseEntitlementsForPage/remainingAfterBalancePatch.js";
import { groupFilterReplaceRows } from "../utils/groupFilterReplaceRows.js";
import { toRemovedItem } from "../utils/toRemovedItem.js";
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

/**
 * Replaces live rows matching a compiled filter with the minted to-definition,
 * carrying consumed balance across. Bounded per customer-product page.
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
	patchGroupConcurrency = BATCH_MIGRATION_PATCH_GROUP_CONCURRENCY,
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
	patchGroupConcurrency?: number;
}): Promise<ReplaceCustomerEntitlementsForPageResult> => {
	const toEntitlement = replace.entitlement;
	const resetting = isResettingEntitlement({ entitlement: toEntitlement });
	const excludedIds = new Set<string>();
	const replacedIds = new Set<string>();
	const insertedItems: BatchMigrationInsertedItem[] = [];
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
					selectReplaceCandidateRows({
						db: transaction,
						internalCustomerIds,
						scope,
						entitlement: toEntitlement,
						filter: replace.from,
						excludeEntitlementId: toEntitlement.id,
						features,
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

			const groups = groupFilterReplaceRows({ rows, toEntitlement });
			const patchedGroups = await timePhase({
				phases,
				phase: "replace",
				run: () =>
					mapWithConcurrency({
						items: groups,
						concurrency: patchGroupConcurrency,
						run: (group) =>
							applyReplacePatches({
								db: transaction,
								rows: group.rows,
								scope,
								toEntitlement,
								customerEntitlementPatch: group.patch,
							}),
					}),
			});

			const updatedIdToPatch = new Map<string, CustomerEntitlementPatch>();
			for (const [index, patched] of patchedGroups.entries()) {
				const group = groups[index];
				if (!group) continue;
				for (const id of patched.internalCustomerIds) replacedIds.add(id);
				for (const id of patched.updatedIds) {
					updatedIdToPatch.set(id, group.patch);
				}
			}

			for (const row of rows) {
				const customerEntitlementPatch = updatedIdToPatch.get(
					row.customerEntitlementId,
				);
				if (!customerEntitlementPatch) continue;
				const fromEntitlement = row.liveDefinition;
				if (!fromEntitlement) continue;
				removedItems.push(
					toRemovedItem({ row, planId: fromProduct.id, fromEntitlement }),
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
