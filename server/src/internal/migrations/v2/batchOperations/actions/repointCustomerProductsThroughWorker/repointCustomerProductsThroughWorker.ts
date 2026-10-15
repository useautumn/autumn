import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { RoutedPageCustomer } from "@/internal/migrations/v2/batchOperations/execute/routing/types/routedPageCustomer.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "@/internal/migrations/v2/batchOperations/execute/utils/pagePhaseTimings.js";
import type { BatchMigrationExecutionPatch } from "@/internal/migrations/v2/batchOperations/types/index.js";
import { isHeldByWorker } from "../throughWorker/isHeldByWorker.js";
import { runRowsOnWorker } from "../throughWorker/runRowsOnWorker.js";
import type { WorkerPageGate } from "../throughWorker/types/workerPageGate.js";
import {
	emptyWorkerPhaseResult,
	type WorkerPhaseResult,
} from "../throughWorker/types/workerPhaseResult.js";
import { repointRowsToMigrationPlan } from "./repointRowsToMigrationPlan.js";
import { repointUnheldRowsInPostgres } from "./repointUnheldRowsInPostgres.js";
import { selectRepointRows } from "./selectRepointRows.js";

export const repointCustomerProductsThroughWorker = async ({
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
	const { repointCustomerProduct } = patch;
	if (customers.length === 0 || !repointCustomerProduct)
		return emptyWorkerPhaseResult();
	const toProduct = patch.toProduct ?? patch.fromProduct;
	const select = ({ internalCustomerIds }: { internalCustomerIds: string[] }) =>
		selectRepointRows({
			db: ctx.db,
			internalCustomerIds,
			scope: patch.scope,
		});

	const rows = await timePhase({
		phases,
		phase: "worker_candidates",
		run: () =>
			select({
				internalCustomerIds: customers.map(({ internalId }) => internalId),
			}),
	});
	const repointedUnheldRows = await timePhase({
		phases,
		phase: "worker_unheld",
		run: () =>
			repointUnheldRowsInPostgres({
				ctx,
				scope: patch.scope,
				toInternalProductId: repointCustomerProduct.toInternalProductId,
				rows: rows.filter((row) => !isHeldByWorker({ row })),
			}),
	});
	const { appliedRows, failureReasons, fallbackInternalCustomerIds } =
		await timePhase({
			phases,
			phase: "worker_repoint",
			run: () =>
				runRowsOnWorker({
					ctx,
					migrationRunId,
					gate,
					commandScope: `${patch.opIndex}_repoint`,
					customers,
					rows: rows.filter((row) => isHeldByWorker({ row })),
					toPlan: ({ rows: customerRows }) =>
						repointRowsToMigrationPlan({ rows: customerRows, toProduct }),
					reselect: ({ customer }) =>
						select({ internalCustomerIds: [customer.internalId] }),
				}),
		});

	return {
		...emptyWorkerPhaseResult(),
		candidateCount: rows.length,
		repointedProducts: [...repointedUnheldRows, ...appliedRows].map((row) => ({
			internalCustomerId: row.internalCustomerId,
			customerProductId: row.customerProductId,
			entityId: row.entityId,
			status: row.status,
			startsAt: row.startsAt,
			canceledAt: row.canceledAt,
			endedAt: row.endedAt,
			trialEndsAt: row.trialEndsAt,
			fromProduct: patch.fromProduct,
			toProduct,
		})),
		failureReasons,
		fallbackInternalCustomerIds,
		sqlWrittenInternalCustomerIds: [
			...new Set(
				repointedUnheldRows.map(({ internalCustomerId }) => internalCustomerId),
			),
		],
	};
};
