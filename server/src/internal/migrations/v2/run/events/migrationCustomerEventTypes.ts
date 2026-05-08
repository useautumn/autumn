export type MigrationCustomerEventType =
	| "migration_started"
	| "migration_succeeded"
	| "migration_partially_failed"
	| "migration_failed"
	| "customer_started"
	| "customer_succeeded"
	| "customer_failed"
	| "customer_skipped";

export type MigrationCustomerEventDetails = Record<string, unknown>;

export type MigrationCustomerEventInput = {
	eventType: MigrationCustomerEventType;
	internalCustomerId?: string | null;
	customerId?: string | null;
	details?: MigrationCustomerEventDetails;
};

export type MigrationCustomerEvent = MigrationCustomerEventInput & {
	orgId: string;
	env: string;
	migrationId: string;
	migrationRunId: string;
	dryRun: boolean;
	timestamp?: string;
};
