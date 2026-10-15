import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { RoutedPageCustomer } from "@/internal/migrations/v2/batchOperations/execute/routing/types/routedPageCustomer.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "@/internal/migrations/v2/batchOperations/execute/utils/pagePhaseTimings.js";
import type { BatchMigrationExecutionPatch } from "@/internal/migrations/v2/batchOperations/types/index.js";
import { toInsertedItem } from "../replaceCustomerEntitlementsForPage/replaceCustomerEntitlementsForPage.js";
import { isHeldByWorker } from "../throughWorker/isHeldByWorker.js";
import { runRowsOnWorker } from "../throughWorker/runRowsOnWorker.js";
import type { WorkerPageGate } from "../throughWorker/types/workerPageGate.js";
import {
	emptyWorkerPhaseResult,
	type WorkerPhaseResult,
} from "../throughWorker/types/workerPhaseResult.js";
import { toRemovedItem } from "../utils/toRemovedItem.js";
import { replaceRowsToMigrationPlan } from "./replaceRowsToMigrationPlan.js";
import { replaceUnheldRowsInPostgres } from "./replaceUnheldRowsInPostgres.js";
import { selectPatchReplaceRows } from "./selectPatchReplaceRows.js";
import type { ReplaceWorkerRow } from "./types/replaceWorkerRow.js";

const rowsToItems = ({
	rows,
	patch,
}: {
	rows: ReplaceWorkerRow[];
	patch: BatchMigrationExecutionPatch;
}): Pick<WorkerPhaseResult, "insertedItems" | "removedItems"> => {
	const planId = patch.fromProduct.id;
	const replacedRows = rows.flatMap((row) =>
		row.liveDefinition ? [{ row, fromEntitlement: row.liveDefinition }] : [],
	);
	return {
		removedItems: replacedRows.map(({ row, fromEntitlement }) =>
			toRemovedItem({ row, planId, fromEntitlement }),
		),
		insertedItems: replacedRows.map(({ row }) =>
			toInsertedItem({
				row,
				planId,
				replace: row.replace,
				customerEntitlementPatch: row.customerEntitlementPatch,
			}),
		),
	};
};

export const replaceCustomerEntitlementsThroughWorker = async ({
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
	if (customers.length === 0 || patch.replaceEntitlementOps.length === 0)
		return emptyWorkerPhaseResult();

	const selected = await timePhase({
		phases,
		phase: "worker_candidates",
		run: () =>
			selectPatchReplaceRows({
				ctx,
				patch,
				internalCustomerIds: customers.map(({ internalId }) => internalId),
				now,
			}),
	});
	const replacedUnheldRows = await timePhase({
		phases,
		phase: "worker_unheld",
		run: () =>
			replaceUnheldRowsInPostgres({
				ctx,
				patch,
				rows: selected.rows.filter((row) => !isHeldByWorker({ row })),
			}),
	});
	const { appliedRows, failureReasons, fallbackInternalCustomerIds } =
		await timePhase({
			phases,
			phase: "worker_replace",
			run: () =>
				runRowsOnWorker({
					ctx,
					migrationRunId,
					gate,
					commandScope: `${patch.opIndex}_replace`,
					customers,
					rows: selected.rows.filter((row) => isHeldByWorker({ row })),
					toPlan: replaceRowsToMigrationPlan,
					reselect: async ({ customer }) =>
						(
							await selectPatchReplaceRows({
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
		...rowsToItems({ rows: [...replacedUnheldRows, ...appliedRows], patch }),
		candidateCount: selected.candidateCount,
		excludedInternalCustomerIds: selected.excludedInternalCustomerIds,
		failureReasons,
		fallbackInternalCustomerIds,
		sqlWrittenInternalCustomerIds: [
			...new Set(
				replacedUnheldRows.map(({ internalCustomerId }) => internalCustomerId),
			),
		],
	};
};
