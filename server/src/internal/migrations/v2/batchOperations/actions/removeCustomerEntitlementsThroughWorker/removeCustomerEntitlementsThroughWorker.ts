import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { RoutedPageCustomer } from "@/internal/migrations/v2/batchOperations/execute/routing/types/routedPageCustomer.js";
import type { BatchMigrationRemovedItem } from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "@/internal/migrations/v2/batchOperations/execute/utils/pagePhaseTimings.js";
import type { BatchMigrationExecutionPatch } from "@/internal/migrations/v2/batchOperations/types/index.js";
import type { RemoveCandidateRow } from "../removeCustomerEntitlementsForPage/selectRemoveCandidateRows.js";
import { isHeldByWorker } from "../throughWorker/isHeldByWorker.js";
import { runRowsOnWorker } from "../throughWorker/runRowsOnWorker.js";
import type { WorkerPageGate } from "../throughWorker/types/workerPageGate.js";
import {
	emptyWorkerPhaseResult,
	type WorkerPhaseResult,
} from "../throughWorker/types/workerPhaseResult.js";
import { toRemovedItem } from "../utils/toRemovedItem.js";
import { removeCandidatesToMigrationPlan } from "./removeCandidatesToMigrationPlan.js";
import { removeUnheldRowsInPostgres } from "./removeUnheldRowsInPostgres.js";
import { selectPatchRemoveCandidates } from "./selectPatchRemoveCandidates.js";

const rowsToRemovedItems = ({
	rows,
	patch,
}: {
	rows: RemoveCandidateRow[];
	patch: BatchMigrationExecutionPatch;
}): BatchMigrationRemovedItem[] =>
	rows.flatMap((row) =>
		row.liveDefinition
			? [
					toRemovedItem({
						row,
						planId: patch.fromProduct.id,
						fromEntitlement: row.liveDefinition,
					}),
				]
			: [],
	);

export const removeCustomerEntitlementsThroughWorker = async ({
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
	customers: RoutedPageCustomer[];
	phases?: BatchMigrationPagePhases;
}): Promise<WorkerPhaseResult> => {
	if (customers.length === 0 || patch.removeEntitlementOps.length === 0)
		return emptyWorkerPhaseResult();

	const candidates = await timePhase({
		phases,
		phase: "worker_candidates",
		run: () =>
			selectPatchRemoveCandidates({
				ctx,
				patch,
				internalCustomerIds: customers.map(({ internalId }) => internalId),
			}),
	});
	const removedUnheldRows = await timePhase({
		phases,
		phase: "worker_unheld",
		run: () =>
			removeUnheldRowsInPostgres({
				ctx,
				patch,
				rows: candidates.filter((row) => !isHeldByWorker({ row })),
			}),
	});
	const { appliedRows, failureReasons, fallbackInternalCustomerIds } =
		await timePhase({
			phases,
			phase: "worker_remove",
			run: () =>
				runRowsOnWorker({
					ctx,
					migrationRunId,
					gate,
					commandScope: `${patch.opIndex}_remove`,
					customers,
					rows: candidates.filter((row) => isHeldByWorker({ row })),
					toPlan: removeCandidatesToMigrationPlan,
					reselect: async ({ customer }) =>
						await selectPatchRemoveCandidates({
							ctx,
							patch,
							internalCustomerIds: [customer.internalId],
						}),
				}),
		});

	return {
		...emptyWorkerPhaseResult(),
		candidateCount: candidates.length,
		removedItems: rowsToRemovedItems({
			rows: [...removedUnheldRows, ...appliedRows],
			patch,
		}),
		failureReasons,
		fallbackInternalCustomerIds,
		sqlWrittenInternalCustomerIds: [
			...new Set(
				removedUnheldRows.map(({ internalCustomerId }) => internalCustomerId),
			),
		],
	};
};
