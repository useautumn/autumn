import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { WorkerPageGate } from "../../../actions/throughWorker/types/workerPageGate.js";
import type { BatchMigrationExecutionPatch } from "../../../types/index.js";
import type { RoutedPageCustomer } from "../../routing/types/routedPageCustomer.js";
import type {
	BatchMigrationInsertedItem,
	BatchMigrationRemovedItem,
	BatchMigrationRepointedProduct,
} from "../../types/batchMigrationExecutionTypes.js";
import type { BatchMigrationPagePhases } from "../../utils/pagePhaseTimings.js";

export type PatchPhaseArgs = {
	ctx: AutumnContext;
	migrationRunId: string;
	patch: BatchMigrationExecutionPatch;
	sqlInternalCustomerIds: string[];
	workerCustomers: RoutedPageCustomer[];
	workerGate: WorkerPageGate;
	now: number;
	phases?: BatchMigrationPagePhases;
};

export type PatchPhaseResult = {
	insertedItems: BatchMigrationInsertedItem[];
	removedItems: BatchMigrationRemovedItem[];
	repointedProducts: BatchMigrationRepointedProduct[];
	changedInternalCustomerIds: string[];
	excludedInternalCustomerIds: string[];
	failureReasons: Record<string, string>;
	sqlWrittenWorkerCustomerIds: string[];
};
