import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";
import type { BatchMigrationInsertedItem } from "../../execute/types/batchMigrationExecutionTypes.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "../../execute/utils/pagePhaseTimings.js";
import type { OperationScope } from "../../scope/operationScope.js";
import type { BatchMigrationExecutionAddLicense } from "../../types/batchMigrationExecutionPlan.js";
import { enrichCustomerEntitlementCycles } from "../../utils/enrichCustomerEntitlementCycles.js";
import { insertLicenseCustomerEntitlementRows } from "./insertLicenseCustomerEntitlementRows.js";
import type { LicenseCandidateRow } from "./selectLicenseAddCandidateRows.js";

export type EnrichAndInsertLicenseCandidatesResult = {
	insertedItems: BatchMigrationInsertedItem[];
	excludedInternalCustomerIds: string[];
};

/**
 * Resolves each candidate's reset cycle, then inserts. Non-resetting
 * entitlements carry no cycle — a boolean with a next_reset_at would reset a
 * flag on a clock it never had.
 */
export const enrichAndInsertLicenseCandidates = async ({
	db,
	candidates,
	scope,
	add,
	resetting,
	now,
	phases,
}: {
	db: DrizzleCli;
	candidates: LicenseCandidateRow[];
	scope: OperationScope;
	add: BatchMigrationExecutionAddLicense;
	resetting: boolean;
	now: number;
	phases?: BatchMigrationPagePhases;
}): Promise<EnrichAndInsertLicenseCandidatesResult> => {
	const enriched = resetting
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

	const insertableRows = enriched.rows.map((row) => ({
		...row,
		id: generateId("cus_ent"),
	}));

	const insertedIds = await timePhase({
		phases,
		phase: "insert",
		run: () =>
			insertLicenseCustomerEntitlementRows({
				db,
				rows: insertableRows,
				scope,
				initialState: add.initialState,
				now,
			}),
	});

	const insertedIdSet = new Set(insertedIds);
	const insertedItems: BatchMigrationInsertedItem[] = [];
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
			nextResetAt: row.nextResetAt,
			status: row.status,
			startsAt: row.startsAt,
			canceledAt: row.canceledAt,
			endedAt: row.endedAt,
			trialEndsAt: row.trialEndsAt,
		});
	}

	return {
		insertedItems,
		excludedInternalCustomerIds: enriched.excludedInternalCustomerIds,
	};
};
