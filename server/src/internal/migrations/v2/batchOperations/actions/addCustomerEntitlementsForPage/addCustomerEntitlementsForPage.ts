import {
	type FullProductWithoutLicenses,
	isResettingEntitlement,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { iterateCustomerProductPages } from "@/internal/migrations/v2/batchOperations/execute/customerProductPagination/index.js";
import type { BatchMigrationInsertedItem } from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";
import { BATCH_MIGRATION_CANDIDATE_ROW_BATCH } from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import {
	addPhaseDuration,
	type BatchMigrationPagePhases,
	timePhase,
} from "@/internal/migrations/v2/batchOperations/execute/utils/pagePhaseTimings.js";
import type { OperationScope } from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import type { BatchMigrationExecutionAdd } from "@/internal/migrations/v2/batchOperations/types/index.js";
import {
	type CycleEnrichmentCandidate,
	enrichCustomerEntitlementCycles,
} from "@/internal/migrations/v2/batchOperations/utils/enrichCustomerEntitlementCycles.js";
import { generateId } from "@/utils/genUtils.js";
import { insertCustomerEntitlementRows } from "./insertCustomerEntitlementRows.js";
import { selectAddCandidateRows } from "./selectAddCandidateRows.js";

export type AddCustomerEntitlementsForPageResult = {
	affected: number;
	/** Scope-matched candidate rows visited for the page (advisory). */
	candidateCount: number;
	/** Customers a rung refused — the page marks them skipped. */
	excludedInternalCustomerIds: string[];
	/** Rows that landed (post scope re-assertion), one per customer product —
	 * a customer can hold several on the same plan, each with its own cycle. */
	insertedItems: BatchMigrationInsertedItem[];
};

/**
 * Adds one entitlement across a page's customer products: select candidates,
 * resolve reset cycles for consumable (resetting/credit) adds via the JS
 * anchor ladder, then a set-based insert. Non-resetting adds skip enrichment
 * and insert with null cycle fields.
 *
 * Runs through `iterateCustomerProductPages`: one bounded transaction per
 * customer-product page, so row-heavy customer pages (customers holding many
 * customer products) never balloon a statement, a transaction, or JS memory.
 */
export const addCustomerEntitlementsForPage = async ({
	db,
	scope,
	internalCustomerIds,
	fromProduct,
	add,
	now,
	phases,
	candidateRowBatchSize = BATCH_MIGRATION_CANDIDATE_ROW_BATCH,
}: {
	db: DrizzleCli;
	/** The patch's lowered row-level scope. */
	scope: OperationScope;
	internalCustomerIds: string[];
	/** The patch's plan-filter-matched catalog product (id + price facts). */
	fromProduct: FullProductWithoutLicenses;
	add: BatchMigrationExecutionAdd;
	now: number;
	phases?: BatchMigrationPagePhases;
	candidateRowBatchSize?: number;
}): Promise<AddCustomerEntitlementsForPageResult> => {
	const resetting = isResettingEntitlement({ entitlement: add.entitlement });

	const excludedIds = new Set<string>();
	const insertedItems: BatchMigrationInsertedItem[] = [];

	const { rowCount } = await iterateCustomerProductPages({
		db,
		pageSize: candidateRowBatchSize,
		executePage: async ({ transaction, afterCustomerProductId, limit }) => {
			const candidates = await timePhase({
				phases,
				phase: "candidates",
				run: () =>
					selectAddCandidateRows({
						db: transaction,
						internalCustomerIds,
						scope,
						entitlement: add.entitlement,
						includeAnchorSources: resetting,
						afterCustomerProductId,
						limit,
					}),
			});
			if (candidates.length === 0) return candidates;

			const inserted = await enrichAndInsertCandidates({
				db: transaction,
				scope,
				fromProduct,
				add,
				now,
				phases,
				resetting,
				candidates,
			});
			for (const id of inserted.excludedInternalCustomerIds)
				excludedIds.add(id);
			insertedItems.push(...inserted.insertedItems);
			return candidates;
		},
	});

	return {
		affected: insertedItems.length,
		candidateCount: rowCount,
		excludedInternalCustomerIds: [...excludedIds],
		insertedItems,
	};
};

/** One customer-product page through the pipeline: resolve reset cycles →
 * set-based insert → map the rows that actually landed. */
const enrichAndInsertCandidates = async ({
	db,
	scope,
	fromProduct,
	add,
	now,
	phases,
	resetting,
	candidates,
}: {
	db: DrizzleCli;
	scope: OperationScope;
	fromProduct: FullProductWithoutLicenses;
	add: BatchMigrationExecutionAdd;
	now: number;
	phases?: BatchMigrationPagePhases;
	resetting: boolean;
	candidates: CycleEnrichmentCandidate[];
}): Promise<{
	excludedInternalCustomerIds: string[];
	insertedItems: BatchMigrationInsertedItem[];
}> => {
	const enrichStartedAt = Date.now();
	const { rows, excludedInternalCustomerIds } = resetting
		? enrichCustomerEntitlementCycles({
				candidates,
				entitlement: add.entitlement,
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
	addPhaseDuration({ phases, phase: "enrich", startedAt: enrichStartedAt });

	const insertableRows = rows.map((row) => ({
		...row,
		id: generateId("cus_ent"),
	}));
	const insertedIds = await timePhase({
		phases,
		phase: "insert",
		run: () =>
			insertCustomerEntitlementRows({
				db,
				scope,
				entitlement: add.entitlement,
				initialState: add.initialState,
				rows: insertableRows,
				now,
			}),
	});

	// Keyed by row id, not customer: one customer can hold several customer
	// products on this plan, each landing its own row and cycle.
	const insertedIdSet = new Set(insertedIds);
	return {
		excludedInternalCustomerIds,
		insertedItems: insertableRows
			.filter((row) => insertedIdSet.has(row.id))
			.map((row) => ({
				internalCustomerId: row.internalCustomerId,
				customerProductId: row.customerProductId,
				entityId: row.entityId,
				planId: fromProduct.id,
				featureId: add.entitlement.feature.id,
				granted: add.initialState.granted,
				unlimited: add.initialState.unlimited === true,
				nextResetAt: row.nextResetAt,
				status: row.status,
				startsAt: row.startsAt,
				canceledAt: row.canceledAt,
				endedAt: row.endedAt,
				trialEndsAt: row.trialEndsAt,
			})),
	};
};
