import type { DrizzleCli } from "@/db/initDrizzle.js";
import type {
	BatchMigrationInsertedItem,
	BatchMigrationRemovedItem,
	BatchMigrationRepointedProduct,
} from "./batchMigrationExecutionTypes.js";

/** What one op transaction changed, in the shapes the ops already report. */
export type BatchMigrationChanges = {
	insertedItems?: BatchMigrationInsertedItem[];
	removedItems?: BatchMigrationRemovedItem[];
	repointedProducts?: BatchMigrationRepointedProduct[];
	repointedPoolCustomerIds?: string[];
};

/** Records an op's changes on its customers' item runs, inside the op's own
 * transaction, so the changes commit if and only if the writes do. */
export type RecordBatchMigrationChanges = (args: {
	db: DrizzleCli;
	changes: BatchMigrationChanges;
}) => Promise<void>;
