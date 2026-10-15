import type {
	BatchMigrationInsertedItem,
	BatchMigrationRemovedItem,
	BatchMigrationRepointedProduct,
} from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";

export type WorkerPhaseResult = {
	candidateCount: number;
	insertedItems: BatchMigrationInsertedItem[];
	removedItems: BatchMigrationRemovedItem[];
	repointedProducts: BatchMigrationRepointedProduct[];
	excludedInternalCustomerIds: string[];
	failureReasons: Record<string, string>;
	fallbackInternalCustomerIds: string[];
	sqlWrittenInternalCustomerIds: string[];
};

export const emptyWorkerPhaseResult = (): WorkerPhaseResult => ({
	candidateCount: 0,
	insertedItems: [],
	removedItems: [],
	repointedProducts: [],
	excludedInternalCustomerIds: [],
	failureReasons: {},
	fallbackInternalCustomerIds: [],
	sqlWrittenInternalCustomerIds: [],
});
