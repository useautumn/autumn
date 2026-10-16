import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type {
	BatchMigrationPageCustomer,
	BatchMigrationRemovedItem,
} from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";
import type { BatchMigrationPagePhases } from "@/internal/migrations/v2/batchOperations/execute/utils/pagePhaseTimings.js";
import type { BatchMigrationExecutionPatch } from "@/internal/migrations/v2/batchOperations/types/index.js";
import { removeCustomerEntitlementsOnWorker } from "../removeCustomerEntitlementsOnWorker/removeCustomerEntitlementsOnWorker.js";
import type { WorkerPageGate } from "../throughWorker/types/workerPageGate.js";

/** Grows one field per op the worker path takes on. */
export type PatchOnWorkerResult = {
	removedItems: BatchMigrationRemovedItem[];
	failReasons: Record<string, string>;
};

/** One patch of a page through the balance worker, op by op in dev's order. */
export const executePatchOnWorker = async ({
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
}): Promise<PatchOnWorkerResult> => {
	const removes = await removeCustomerEntitlementsOnWorker({
		ctx,
		migrationRunId,
		gate,
		patch,
		customers,
		phases,
	});

	return {
		removedItems: removes.removedItems,
		failReasons: removes.failureReasons,
	};
};
