import type { CusProductStatus } from "@autumn/shared";

/** One claimed customer flowing through a page. Preview fields feed the
 * Tinybird item events; `id` also keys the cache bust. */
export type BatchMigrationPageCustomer = {
	internalId: string;
	id: string | null;
	name: string | null;
	email: string | null;
};

/** One entitlement row this page actually inserted. Feeds the synthesized
 * per-customer response (Tinybird events and webhook payloads) without
 * re-reading customers: the candidate dedup guarantees the feature was absent
 * before, so this IS the customer's diff. */
export type BatchMigrationInsertedItem = {
	internalCustomerId: string;
	/** A customer can hold several products on the migrated plan (entity
	 * scoped, etc.); each carries its own cycle, so rows stay per product. */
	customerProductId: string;
	planId: string;
	featureId: string;
	granted: number | null;
	unlimited: boolean;
	nextResetAt: number | null;
	/** Public id of the owning entity when the customer product is entity-level. */
	entityId: string | null;
	/** Customer-product lifecycle state at candidate-select time — the
	 * webhook plan-change snapshot, captured in-transaction for free. */
	status: CusProductStatus;
	startsAt: number | null;
	canceledAt: number | null;
	endedAt: number | null;
	trialEndsAt: number | null;
};

export type BatchMigrationPageResult = {
	/** Customers with a matching customer product — mutated and marked succeeded. */
	succeeded: BatchMigrationPageCustomer[];
	/** Customers with no batch-eligible customer product — marked skipped;
	 * retryable via retry_item_statuses through the per-customer lane. */
	skipped: BatchMigrationPageCustomer[];
	/** Rows inserted this page, in patch order. */
	insertedItems: BatchMigrationInsertedItem[];
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
