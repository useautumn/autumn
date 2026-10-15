import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { RoutedPageCustomer } from "@/internal/migrations/v2/batchOperations/execute/routing/types/routedPageCustomer.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "@/internal/migrations/v2/batchOperations/execute/utils/pagePhaseTimings.js";
import type { BatchMigrationExecutionPatch } from "@/internal/migrations/v2/batchOperations/types/index.js";
import { toAddedItem } from "../addCustomerEntitlementsForPage/addCustomerEntitlementsForPage.js";
import { isHeldByWorker } from "../throughWorker/isHeldByWorker.js";
import { runRowsOnWorker } from "../throughWorker/runRowsOnWorker.js";
import type { WorkerPageGate } from "../throughWorker/types/workerPageGate.js";
import {
	emptyWorkerPhaseResult,
	type WorkerPhaseResult,
} from "../throughWorker/types/workerPhaseResult.js";
import { addRowsToMigrationPlan } from "./addRowsToMigrationPlan.js";
import { addUnheldRowsInPostgres } from "./addUnheldRowsInPostgres.js";
import { selectPatchAddRows } from "./selectPatchAddRows.js";

export const addCustomerEntitlementsThroughWorker = async ({
	ctx,
	migrationRunId,
	gate,
	patch,
	customers,
	now,
	phases,
}: {
	ctx: AutumnContext;
	migrationRunId: string;
	gate: WorkerPageGate;
	patch: BatchMigrationExecutionPatch;
	customers: RoutedPageCustomer[];
	now: number;
	phases?: BatchMigrationPagePhases;
}): Promise<WorkerPhaseResult> => {
	if (customers.length === 0 || patch.addEntitlementOps.length === 0)
		return emptyWorkerPhaseResult();

	const selected = await timePhase({
		phases,
		phase: "worker_candidates",
		run: () =>
			selectPatchAddRows({
				ctx,
				patch,
				internalCustomerIds: customers.map(({ internalId }) => internalId),
				now,
			}),
	});
	const addedUnheldRows = await timePhase({
		phases,
		phase: "worker_unheld",
		run: () =>
			addUnheldRowsInPostgres({
				ctx,
				patch,
				rows: selected.rows.filter((row) => !isHeldByWorker({ row })),
				now,
			}),
	});
	const { appliedRows, failureReasons, fallbackInternalCustomerIds } =
		await timePhase({
			phases,
			phase: "worker_add",
			run: () =>
				runRowsOnWorker({
					ctx,
					migrationRunId,
					gate,
					commandScope: `${patch.opIndex}_add`,
					customers,
					rows: selected.rows.filter((row) => isHeldByWorker({ row })),
					toPlan: ({ rows }) => addRowsToMigrationPlan({ rows, now }),
					reselect: async ({ customer }) =>
						(
							await selectPatchAddRows({
								ctx,
								patch,
								internalCustomerIds: [customer.internalId],
								now,
							})
						).rows,
				}),
		});

	return {
		...emptyWorkerPhaseResult(),
		insertedItems: [...addedUnheldRows, ...appliedRows].map((row) =>
			toAddedItem({ row, planId: patch.fromProduct.id, add: row.add }),
		),
		candidateCount: selected.candidateCount,
		excludedInternalCustomerIds: selected.excludedInternalCustomerIds,
		failureReasons,
		fallbackInternalCustomerIds,
		sqlWrittenInternalCustomerIds: [
			...new Set(
				addedUnheldRows.map(({ internalCustomerId }) => internalCustomerId),
			),
		],
	};
};
