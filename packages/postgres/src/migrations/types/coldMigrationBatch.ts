export type ColdMigrationOp = {
	kind: "delete" | "update" | "increment";
	customerEntitlementId: string;
	expect?: Record<string, string | number | boolean | null>;
	expectProduct?: {
		columns?: Record<string, string | number | boolean | null>;
		customerPriceIds: string[];
	};
	withoutRollovers?: boolean;
	set?: Record<string, unknown>;
	addBalance?: number;
};

export type ColdMigrationCustomer = {
	internalCustomerId: string;
	orgId: string;
	env: string;
	customerId: string;
	migrationInternalId: string;
	migrationRunId: string;
	ops: ColdMigrationOp[];
};

/** One partition's cold customers, written under the owner's claim or not at all. */
export type ColdMigrationBatch = {
	topic: string;
	partition: number;
	claimToken: string;
	customers: ColdMigrationCustomer[];
	forceRollback?: boolean;
};

export type ColdMigrationBatchResult = {
	applied: string[];
	stale: string[];
	settled: string[];
	deleted: number;
	updated: number;
	snapshotsDeleted: number;
	runsMarked: number;
};
