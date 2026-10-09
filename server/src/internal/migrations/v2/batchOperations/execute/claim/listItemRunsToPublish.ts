import type {
	MigrationItemChange,
	MigrationItemRunSkipReason,
	MigrationItemRunStatus,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { BatchMigrationPageCustomer } from "../types/batchMigrationExecutionTypes.js";

/** One customer's item run as the publisher reads it. */
export type ItemRunToPublish = {
	customer: BatchMigrationPageCustomer;
	migrationRunId: string | null;
	status: MigrationItemRunStatus;
	skipReason: MigrationItemRunSkipReason | null;
	changes: MigrationItemChange[] | null;
};

export const listItemRunsToPublish = async ({
	db,
	migrationInternalId,
	internalCustomerIds,
}: {
	db: DrizzleCli;
	migrationInternalId: string;
	internalCustomerIds: string[];
}): Promise<ItemRunToPublish[]> => {
	const rows = await db.execute<{
		item_id: string;
		migration_run_id: string | null;
		status: MigrationItemRunStatus;
		skip_reason: MigrationItemRunSkipReason | null;
		unpublished_changes: MigrationItemChange[] | null;
		id: string | null;
		name: string | null;
		email: string | null;
	}>(sql`
		SELECT mir.item_id, mir.migration_run_id, mir.status, mir.skip_reason, mir.unpublished_changes,
			customer.id, customer.name, customer.email
		FROM migration_item_runs AS mir
		INNER JOIN customers AS customer ON customer.internal_id = mir.item_id
		WHERE mir.migration_internal_id = ${migrationInternalId}
			AND mir.item_kind = 'customer'
			AND mir.dry_run = false
			AND mir.item_id = ANY(${sql.param(internalCustomerIds)}::text[])
	`);

	return rows.map((row) => ({
		migrationRunId: row.migration_run_id,
		customer: {
			internalId: row.item_id,
			id: row.id,
			name: row.name,
			email: row.email,
		},
		status: row.status,
		skipReason: row.skip_reason,
		changes: row.unpublished_changes,
	}));
};
