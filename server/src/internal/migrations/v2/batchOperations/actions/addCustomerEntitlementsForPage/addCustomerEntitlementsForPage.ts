import { isResettingEntitlement } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	addPhaseDuration,
	type BatchMigrationPagePhases,
	timePhase,
} from "@/internal/migrations/v2/batchOperations/execute/utils/pagePhaseTimings.js";
import type { BatchMigrationExecutionAdd } from "@/internal/migrations/v2/batchOperations/types/index.js";
import { enrichCustomerEntitlementCycles } from "@/internal/migrations/v2/batchOperations/utils/enrichCustomerEntitlementCycles.js";
import { generateId } from "@/utils/genUtils.js";
import { insertCustomerEntitlementRows } from "./insertCustomerEntitlementRows.js";
import { selectAddCandidateRows } from "./selectAddCandidateRows.js";

export type AddCustomerEntitlementsForPageResult = {
	affected: number;
	/** Customers a rung refused — the page marks them skipped. */
	excludedInternalCustomerIds: string[];
};

/**
 * Adds one entitlement across a page's customer products: select candidates,
 * resolve reset cycles for consumable (resetting/credit) adds via the JS
 * anchor ladder, then one set-based insert. Non-resetting adds skip
 * enrichment and insert with null cycle fields.
 */
export const addCustomerEntitlementsForPage = async ({
	db,
	internalCustomerIds,
	fromInternalProductId,
	add,
	now,
	phases,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	fromInternalProductId: string;
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
				fromInternalProductId,
				entitlement: add.entitlement,
				includeAnchorSources: resetting,
			}),
	});
	if (candidates.length === 0)
		return { affected: 0, excludedInternalCustomerIds: [] };

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

	const affected = await timePhase({
		phases,
		phase: "insert",
		run: () =>
			insertCustomerEntitlementRows({
				db,
				fromInternalProductId,
				entitlement: add.entitlement,
				initialState: add.initialState,
				rows: rows.map((row) => ({ ...row, id: generateId("cus_ent") })),
				now,
			}),
	});

	return { affected, excludedInternalCustomerIds };
};
