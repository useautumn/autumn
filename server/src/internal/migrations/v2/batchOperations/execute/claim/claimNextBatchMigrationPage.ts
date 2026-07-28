import {
	type MigrationItemRunInsert,
	MigrationItemRunStatus,
	migrationItemRuns,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildCustomerSelect } from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import type { CustomerRow } from "@/internal/migrations/v2/filters/customers/filterCustomers.js";
import type { MigrationRuntimeWithEventId } from "@/internal/migrations/v2/types/migrationDefinition.js";
import { generateId } from "@/utils/genUtils.js";
import type { BatchMigrationPageCustomer } from "../types/batchMigrationExecutionTypes.js";

export type ClaimedBatchMigrationPage = {
	/** Rows the filter select returned — drives the cursor and loop end. */
	selectedCount: number;
	/** Keyset cursor for the next call (last selected internal_id). */
	cursor: string | undefined;
	/** The subset of selected customers this run now owns. */
	customers: BatchMigrationPageCustomer[];
};

/**
 * Selects the next unprocessed filter-matched customers (keyset cursor +
 * checkpoint anti-join), then claims them with one bulk upsert. The claim
 * also takes over rows already `running` — crash recovery: a crashed run's
 * orphans are re-claimed and re-executed (mutations are replay-idempotent).
 */
export const claimNextBatchMigrationPage = async ({
	ctx,
	migration,
	migrationInternalId,
	migrationRunId,
	afterInternalId,
	limit,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntimeWithEventId;
	migrationInternalId: string;
	migrationRunId: string;
	afterInternalId?: string;
	limit: number;
}): Promise<ClaimedBatchMigrationPage> => {
	const select = buildCustomerSelect({
		orgId: ctx.org.id,
		env: ctx.env,
		filter: migration.filter?.customer ?? {},
		ctx: { features: ctx.features },
		checkpoint: {
			migrationInternalId,
			migrationRunId,
			dryRun: false,
			// `running` stays selectable so orphaned claims from a crashed run
			// are re-encountered and taken over below.
			excludedStatuses: [
				MigrationItemRunStatus.Succeeded,
				MigrationItemRunStatus.Skipped,
				MigrationItemRunStatus.Failed,
			],
		},
		limit,
		afterInternalId,
	});
	const selected = (await ctx.db.execute(select)) as CustomerRow[];
	if (selected.length === 0)
		return { selectedCount: 0, cursor: afterInternalId, customers: [] };

	const now = Date.now();
	const values: MigrationItemRunInsert[] = selected.map((row) => ({
		migration_item_run_id: generateId("mir"),
		migration_internal_id: migrationInternalId,
		migration_run_id: migrationRunId,
		dry_run: false,
		item_kind: "customer",
		item_id: row.internal_id,
		status: MigrationItemRunStatus.Running,
		created_at: now,
		updated_at: null,
	}));
	const claimed = await ctx.db
		.insert(migrationItemRuns)
		.values(values)
		.onConflictDoUpdate({
			target: [
				migrationItemRuns.migration_internal_id,
				migrationItemRuns.item_kind,
				migrationItemRuns.item_id,
			],
			targetWhere: sql`${migrationItemRuns.dry_run} = false`,
			set: {
				migration_run_id: migrationRunId,
				updated_at: now,
			},
			setWhere: sql`${migrationItemRuns.status} = ${MigrationItemRunStatus.Running}`,
		})
		.returning({ item_id: migrationItemRuns.item_id });

	const claimedIds = new Set(claimed.map((row) => row.item_id));
	return {
		selectedCount: selected.length,
		cursor: selected[selected.length - 1].internal_id,
		customers: selected
			.filter((row) => claimedIds.has(row.internal_id))
			.map((row) => ({
				internalId: row.internal_id,
				id: row.id,
				name: row.name,
				email: row.email,
			})),
	};
};
