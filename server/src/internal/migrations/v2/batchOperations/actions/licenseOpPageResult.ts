import type {
	BatchMigrationInsertedItem,
	BatchMigrationRemovedItem,
} from "../execute/types/batchMigrationExecutionTypes.js";

/** What every license op reports back to the page, whatever it did. A verb
 * that changed a customer without inserting a row still names them, so the
 * page can mark them succeeded and invalidate their cache. */
export type LicenseOpPageResult = {
	insertedItems: BatchMigrationInsertedItem[];
	removedItems: BatchMigrationRemovedItem[];
	changedInternalCustomerIds: string[];
	excludedInternalCustomerIds: string[];
};

export const emptyLicenseOpPageResult = (): LicenseOpPageResult => ({
	insertedItems: [],
	removedItems: [],
	changedInternalCustomerIds: [],
	excludedInternalCustomerIds: [],
});
