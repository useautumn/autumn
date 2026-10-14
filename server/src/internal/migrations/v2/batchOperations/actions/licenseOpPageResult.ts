import type {
	BatchMigrationInsertedItem,
	BatchMigrationRemovedItem,
} from "../execute/types/batchMigrationExecutionTypes.js";

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
