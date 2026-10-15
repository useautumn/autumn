import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type {
	BatchMigrationPageCustomer,
	BatchMigrationRemovedItem,
} from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "@/internal/migrations/v2/batchOperations/execute/utils/pagePhaseTimings.js";
import type { BatchMigrationExecutionPatch } from "@/internal/migrations/v2/batchOperations/types/index.js";
import { deleteCustomerEntitlementRows } from "../removeCustomerEntitlementsForPage/deleteCustomerEntitlementRows.js";
import { isHeldByWorker } from "../throughWorker/isHeldByWorker.js";
import { runRowsOnWorker } from "../throughWorker/runRowsOnWorker.js";
import type { WorkerPageCustomer } from "../throughWorker/types/workerPageCustomer.js";
import type { WorkerPageGate } from "../throughWorker/types/workerPageGate.js";
import { toRemovedItem } from "../utils/toRemovedItem.js";
import { removeCandidatesToMigrationPlan } from "./removeCandidatesToMigrationPlan.js";
import {
	type HeldRemoveCandidateRow,
	selectHeldRemoveCandidates,
} from "./selectHeldRemoveCandidates.js";

export type RemoveOnWorkerResult = {
	removedItems: BatchMigrationRemovedItem[];
	failureReasons: Record<string, string>;
};

const hasPublicId = (
	customer: BatchMigrationPageCustomer,
): customer is WorkerPageCustomer => customer.id !== null;

/** Rows no worker holds have no second writer, so they stay a plain SQL delete. */
const deleteUnheldRows = async ({
	ctx,
	patch,
	rows,
}: {
	ctx: AutumnContext;
	patch: BatchMigrationExecutionPatch;
	rows: HeldRemoveCandidateRow[];
}): Promise<HeldRemoveCandidateRow[]> => {
	if (rows.length === 0) return [];
	const deletedIds = new Set(
		await deleteCustomerEntitlementRows({
			db: ctx.db,
			customerEntitlementIds: rows.map((row) => row.customerEntitlementId),
			scope: patch.scope,
		}),
	);
	return rows.filter((row) => deletedIds.has(row.customerEntitlementId));
};

export const removeCustomerEntitlementsOnWorker = async ({
	ctx,
	migrationRunId,
	gate,
	patch,
	customers,
	phases,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
	gate: WorkerPageGate;
	patch: BatchMigrationExecutionPatch;
	customers: BatchMigrationPageCustomer[];
	phases?: BatchMigrationPagePhases;
}): Promise<RemoveOnWorkerResult> => {
	if (patch.removeEntitlementOps.length === 0)
		return { removedItems: [], failureReasons: {} };

	const workerCustomers = customers.filter(hasPublicId);
	const workerCustomerIds = new Set(
		workerCustomers.map(({ internalId }) => internalId),
	);
	const isHeld = (row: HeldRemoveCandidateRow) =>
		workerCustomerIds.has(row.internalCustomerId) && isHeldByWorker({ row });

	const candidates = await timePhase({
		phases,
		phase: "worker_candidates",
		run: () =>
			selectHeldRemoveCandidates({
				ctx,
				patch,
				internalCustomerIds: customers.map(({ internalId }) => internalId),
			}),
	});
	const deletedUnheldRows = await timePhase({
		phases,
		phase: "worker_unheld",
		run: () =>
			deleteUnheldRows({
				ctx,
				patch,
				rows: candidates.filter((row) => !isHeld(row)),
			}),
	});
	const { appliedRows, failureReasons } = await timePhase({
		phases,
		phase: "worker_remove",
		run: () =>
			runRowsOnWorker({
				ctx,
				migrationRunId,
				commandScope: `${patch.opIndex}_remove`,
				customers: workerCustomers,
				rows: candidates.filter(isHeld),
				toPlan: removeCandidatesToMigrationPlan,
				reselect: ({ customer }) =>
					selectHeldRemoveCandidates({
						ctx,
						patch,
						internalCustomerIds: [customer.internalId],
					}),
				gate,
			}),
	});

	return {
		removedItems: [...deletedUnheldRows, ...appliedRows].flatMap((row) =>
			row.liveDefinition
				? [
						toRemovedItem({
							row,
							planId: patch.fromProduct.id,
							fromEntitlement: row.liveDefinition,
						}),
					]
				: [],
		),
		failureReasons,
	};
};
