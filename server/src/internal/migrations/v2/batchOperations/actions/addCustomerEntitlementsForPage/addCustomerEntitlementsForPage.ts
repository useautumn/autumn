import {
	type FullProductWithoutLicenses,
	isResettingEntitlement,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { BatchMigrationInsertedItem } from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";
import {
	addPhaseDuration,
	type BatchMigrationPagePhases,
	timePhase,
} from "@/internal/migrations/v2/batchOperations/execute/utils/pagePhaseTimings.js";
import type { OperationScope } from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import type { BatchMigrationExecutionAdd } from "@/internal/migrations/v2/batchOperations/types/index.js";
import { enrichCustomerEntitlementCycles } from "@/internal/migrations/v2/batchOperations/utils/enrichCustomerEntitlementCycles.js";
import { generateId } from "@/utils/genUtils.js";
import { insertCustomerEntitlementRows } from "./insertCustomerEntitlementRows.js";
import { selectAddCandidateRows } from "./selectAddCandidateRows.js";

export type AddCustomerEntitlementsForPageResult = {
	affected: number;
	/** Customers a rung refused — the page marks them skipped. */
	excludedInternalCustomerIds: string[];
	/** Rows that landed (post scope re-assertion), one per customer product —
	 * a customer can hold several on the same plan, each with its own cycle. */
	insertedItems: BatchMigrationInsertedItem[];
};

/**
 * Adds one entitlement across a page's customer products: select candidates,
 * resolve reset cycles for consumable (resetting/credit) adds via the JS
 * anchor ladder, then one set-based insert. Non-resetting adds skip
 * enrichment and insert with null cycle fields.
 */
export const addCustomerEntitlementsForPage = async ({
	db,
	scope,
	internalCustomerIds,
	fromProduct,
	add,
	now,
	phases,
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
}): Promise<AddCustomerEntitlementsForPageResult> => {
	const resetting = isResettingEntitlement({ entitlement: add.entitlement });

	const candidates = await timePhase({
		phases,
		phase: "candidates",
		run: () =>
			selectAddCandidateRows({
				db,
				internalCustomerIds,
				scope,
				entitlement: add.entitlement,
				includeAnchorSources: resetting,
			}),
	});
	if (candidates.length === 0)
		return { affected: 0, excludedInternalCustomerIds: [], insertedItems: [] };

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
	const insertedItems = insertableRows
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
		}));

	return {
		affected: insertedItems.length,
		excludedInternalCustomerIds,
		insertedItems,
	};
};
