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
	status: MigrationItemRunStatus;
	skipReason: MigrationItemRunSkipReason | null;
	changes: MigrationItemChange[] | null;
};

/** A page publishes its own customers; a sweep publishes every item run of
 * the migration still holding changes. */
export type ItemRunsToPublishScope =
	| { internalCustomerIds: string[] }
	| { unpublished: true };

export const listItemRunsToPublish = async ({
	db,
	migrationInternalId,
	scope,
}: {
	db: DrizzleCli;
	migrationInternalId: string;
	scope: ItemRunsToPublishScope;
}): Promise<ItemRunToPublish[]> => {
	const scopeSql =
		"internalCustomerIds" in scope
			? sql`mir.item_id = ANY(${sql.param(scope.internalCustomerIds)}::text[])`
			: sql`mir.unpublished_changes IS NOT NULL`;

	const rows = await db.execute<{
		item_id: string;
		status: MigrationItemRunStatus;
		skip_reason: MigrationItemRunSkipReason | null;
		unpublished_changes: MigrationItemChange[] | null;
		id: string | null;
		name: string | null;
		email: string | null;
	}>(sql`
		SELECT mir.item_id, mir.status, mir.skip_reason, mir.unpublished_changes,
			customer.id, customer.name, customer.email
		FROM migration_item_runs AS mir
		INNER JOIN customers AS customer ON customer.internal_id = mir.item_id
		WHERE mir.migration_internal_id = ${migrationInternalId}
			AND mir.item_kind = 'customer'
			AND mir.dry_run = false
			AND ${scopeSql}
	`);

	return rows.map((row) => ({
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
