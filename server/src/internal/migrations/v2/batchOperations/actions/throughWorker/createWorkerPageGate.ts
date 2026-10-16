import { BatchMigrationWorkerUnavailableError } from "@/internal/migrations/v2/batchOperations/execute/errors/batchMigrationErrors.js";
import { BATCH_MIGRATION_WORKER_UNAVAILABLE_LIMIT } from "@/internal/migrations/v2/batchOperations/execute/utils/batchMigrationExecutionConstants.js";
import type { WorkerPageGate } from "./types/workerPageGate.js";

/** Throws once the worker is unreachable for too many customers in a row, which ends the run as interrupted. */
export const createWorkerPageGate = ({
	signal,
}: {
	signal: AbortSignal;
}): WorkerPageGate => {
	let unavailableInARow = 0;

	const recordOutcome = ({ unavailable }: { unavailable: boolean }) => {
		unavailableInARow = unavailable ? unavailableInARow + 1 : 0;
		if (unavailableInARow >= BATCH_MIGRATION_WORKER_UNAVAILABLE_LIMIT)
			throw new BatchMigrationWorkerUnavailableError({
				failures: unavailableInARow,
			});
	};

	return { signal, recordOutcome };
};
