import type {
	EntitlementWithFeature,
	FullProductWithoutLicenses,
	MigrationCustomerProductRepointed,
	MigrationEntitlementCreated,
	MigrationEntitlementDeleted,
	MigrationItemRunSkipReason,
} from "@autumn/shared";

/** One claimed customer flowing through a page. Preview fields feed the
 * Tinybird item events; `id` also keys the cache bust. */
export type BatchMigrationPageCustomer = {
	internalId: string;
	id: string | null;
	name: string | null;
	email: string | null;
};

/** One entitlement row this page inserted. The candidate dedup proves the
 * feature was absent before, so the row IS the customer's diff. */
export type BatchMigrationInsertedItem = Omit<
	MigrationEntitlementCreated,
	"kind"
> & {
	internalCustomerId: string;
};

export type BatchMigrationRemovedItem = Omit<
	MigrationEntitlementDeleted,
	"kind" | "entitlementId"
> & {
	internalCustomerId: string;
	entitlement: EntitlementWithFeature;
};

export type BatchMigrationRepointedProduct = Omit<
	MigrationCustomerProductRepointed,
	"kind" | "fromInternalProductId" | "toInternalProductId"
> & {
	internalCustomerId: string;
	fromProduct: FullProductWithoutLicenses;
	toProduct: FullProductWithoutLicenses;
};

export type BatchMigrationPageResult = {
	/** Customers with a matching customer product — mutated and marked succeeded. */
	succeeded: BatchMigrationPageCustomer[];
	/** Customers with no batch-eligible customer product — marked skipped;
	 * retryable via retry_item_statuses through the per-customer lane. */
	skipped: BatchMigrationPageCustomer[];
	skipReasons?: Record<string, MigrationItemRunSkipReason>;
	/** Rows inserted this page, in patch order. */
	insertedItems: BatchMigrationInsertedItem[];
	removedItems: BatchMigrationRemovedItem[];
	repointedProducts?: BatchMigrationRepointedProduct[];
};

export type BatchMigrationExecutionSummary = {
	pages: number;
	succeeded: number;
	skipped: number;
	/** Phase ms summed across the chunk's pages. */
	phases: Record<string, number>;
};

/** One executeBatchMigrationChunk invocation. Contract-compatible with the
 * trigger chunk runner: slice_complete + cursor means "respawn me from here". */
export type BatchMigrationChunkResult = {
	processed: number;
	completion: "exhausted" | "slice_complete" | "stopped";
	cursor: string | null;
	summary: BatchMigrationExecutionSummary;
};
