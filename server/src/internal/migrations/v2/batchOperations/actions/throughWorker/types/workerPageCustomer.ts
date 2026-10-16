import type { BatchMigrationPageCustomer } from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";

/** The worker addresses a customer by its public id, so one without it has no worker copy. */
export type WorkerPageCustomer = BatchMigrationPageCustomer & { id: string };
