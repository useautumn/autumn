import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { toMigrationItemChanges } from "../../itemChanges/toMigrationItemChanges.js";
import type { BatchMigrationChanges } from "../types/batchMigrationChanges.js";

/** The run no longer holds a changed customer's claim: the op must roll back
 * rather than commit writes nobody will settle or publish. */
export class MigrationClaimLostError extends Error {
	constructor({ lost, changed }: { lost: number; changed: number }) {
		super(
			`batch-migration: ${lost} of ${changed} changed customers' claims are no longer held by this run`,
		);
		this.name = "MigrationClaimLostError";
	}
}

/** Appends an op's changes to its customers' `running` claims, inside the op's
 * transaction. Rows lock in item_id order so concurrent ops on one page queue rather than deadlock. */
export const recordItemRunChanges = async ({
	db,
	migrationInternalId,
	migrationRunId,
	changes,
}: {
	db: DrizzleCli;
	migrationInternalId: string;
	migrationRunId: string;
	changes: BatchMigrationChanges;
}): Promise<void> => {
	const changesByCustomer = toMigrationItemChanges(changes);
	if (changesByCustomer.size === 0) return;

	const internalCustomerIds = [...changesByCustomer.keys()];
	const recorded = await db.execute<{ item_id: string }>(sql`
		WITH changes AS (
			SELECT key AS item_id, value AS changes
			FROM jsonb_each(${JSON.stringify(Object.fromEntries(changesByCustomer))}::jsonb)
		),
		owned AS (
			SELECT mir.migration_item_run_id, changes.changes
			FROM migration_item_runs AS mir
			INNER JOIN changes ON changes.item_id = mir.item_id
			WHERE mir.migration_internal_id = ${migrationInternalId}
				AND mir.migration_run_id = ${migrationRunId}
				AND mir.item_kind = 'customer'
				AND mir.dry_run = false
				AND mir.status = 'running'
				AND mir.item_id = ANY(${sql.param(internalCustomerIds)}::text[])
			ORDER BY mir.item_id
			FOR UPDATE OF mir
		)
		UPDATE migration_item_runs AS mir
		SET unpublished_changes =
			COALESCE(mir.unpublished_changes, '[]'::jsonb) || owned.changes
		FROM owned
		WHERE mir.migration_item_run_id = owned.migration_item_run_id
		RETURNING mir.item_id
	`);

	if (recorded.length !== internalCustomerIds.length)
		throw new MigrationClaimLostError({
			lost: internalCustomerIds.length - recorded.length,
			changed: internalCustomerIds.length,
		});
};
