import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";
import type { BatchMigrationInsertedItem } from "../../execute/types/batchMigrationExecutionTypes.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "../../execute/utils/pagePhaseTimings.js";
import type { OperationScope } from "../../scope/operationScope.js";
import type { BatchMigrationMintedLicenseOp } from "../../types/batchMigrationExecutionPlan.js";
import { enrichCustomerEntitlementCycles } from "../../utils/enrichCustomerEntitlementCycles.js";
import { insertLicenseCustomerEntitlementRows } from "./insertLicenseCustomerEntitlementRows.js";
import type { LicenseCandidateRow } from "./selectLicenseAddCandidateRows.js";

export type EnrichAndInsertLicenseCandidatesResult = {
	insertedItems: BatchMigrationInsertedItem[];
	excludedInternalCustomerIds: string[];
};

/** Non-resetting entitlements carry no cycle — a boolean with a next_reset_at
 * would reset a flag on a clock it never had. */
export const enrichAndInsertLicenseCandidates = async ({
	db,
	candidates,
	scope,
	operation,
	resetting,
	now,
	phases,
}: {
	db: DrizzleCli;
	candidates: LicenseCandidateRow[];
	scope: OperationScope;
	operation: BatchMigrationMintedLicenseOp;
	resetting: boolean;
	now: number;
	phases?: BatchMigrationPagePhases;
}): Promise<EnrichAndInsertLicenseCandidatesResult> => {
	const enriched = resetting
		? enrichCustomerEntitlementCycles({
				candidates,
				entitlement: operation.entitlement,
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
				initialState: operation.initialState,
				licensePlanId: operation.licensePlanId,
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
			planId: operation.licensePlanId,
			featureId: row.featureId,
			granted: operation.initialState.granted,
			unlimited: operation.initialState.unlimited === true,
			nextResetAt: row.nextResetAt,
			status: row.status,
			startsAt: row.assignmentStartsAt,
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
