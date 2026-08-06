import { MigrationItemRunStatus } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MigrationRunControls } from "@/internal/migrations/v2/cloudAdapter/types.js";
import { buildCustomerSelect } from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import type { CustomerRow } from "@/internal/migrations/v2/filters/customers/filterCustomers.js";
import { narrowCustomerFilter } from "@/internal/migrations/v2/filters/runFilter.js";
import { normalizeRetryItemStatuses } from "@/internal/migrations/v2/run/utils/retryItemStatuses.js";
import type { MigrationRuntimeWithEventId } from "@/internal/migrations/v2/types/migrationDefinition.js";
import type { BatchMigrationPageCustomer } from "../types/batchMigrationExecutionTypes.js";
import {
	type BatchMigrationPagePhases,
	timePhase,
} from "../utils/pagePhaseTimings.js";

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
	controls,
	phases,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntimeWithEventId;
	migrationInternalId: string;
	migrationRunId: string;
	afterInternalId?: string;
	limit: number;
	controls?: MigrationRunControls;
	phases?: BatchMigrationPagePhases;
}): Promise<ClaimedBatchMigrationPage> => {
	const retryItemStatuses = new Set(
		normalizeRetryItemStatuses({
			retryItemStatuses: controls?.retryItemStatuses,
		}),
	);
	const select = buildCustomerSelect({
		orgId: ctx.org.id,
		env: ctx.env,
		// Same narrowing the per-customer lane applies for `only`.
		filter: narrowCustomerFilter({
			filter: migration.filter?.customer,
			controls,
		}),
		ctx: { features: ctx.features },
		checkpoint: {
			migrationInternalId,
			migrationRunId,
			dryRun: false,
			// `running` stays selectable so orphaned claims from a crashed run
			// are re-encountered and taken over below; retried statuses become
			// selectable again.
			excludedStatuses: [
				MigrationItemRunStatus.Succeeded,
				...(retryItemStatuses.has(MigrationItemRunStatus.Skipped)
					? []
					: [MigrationItemRunStatus.Skipped]),
				...(retryItemStatuses.has(MigrationItemRunStatus.Failed)
					? []
					: [MigrationItemRunStatus.Failed]),
			],
		},
		limit,
		afterInternalId,
	});
	const now = Date.now();
	const claimableStatuses = [
		MigrationItemRunStatus.Running,
		...retryItemStatuses,
	];

	// Select and claim in one statement: the page's rows never leave Postgres,
	// so the claim carries a handful of params rather than ~9 per row.
	const rows = (await timePhase({
		phases,
		phase: "claim_select",
		run: () =>
			ctx.db.execute(sql`
				WITH page AS (${select}),
				claimed AS (
					INSERT INTO migration_item_runs (
						migration_item_run_id, migration_internal_id, migration_run_id,
						dry_run, item_kind, item_id, status, created_at, updated_at
					)
					SELECT
						'mir_' || replace(gen_random_uuid()::text, '-', ''),
						${migrationInternalId}, ${migrationRunId}, false, 'customer',
						page.internal_id, ${MigrationItemRunStatus.Running}, ${now}, NULL
					FROM page
					ON CONFLICT (migration_internal_id, item_kind, item_id)
						WHERE dry_run = false
					DO UPDATE SET
						migration_run_id = ${migrationRunId},
						status = ${MigrationItemRunStatus.Running},
						updated_at = ${now}
					WHERE migration_item_runs.status = ANY(${sql.param(claimableStatuses)}::text[])
					RETURNING item_id
				)
				SELECT page.*, (page.internal_id IN (SELECT item_id FROM claimed)) AS claimed
				FROM page
			`),
	})) as (CustomerRow & { claimed: boolean })[];

	if (rows.length === 0)
		return { selectedCount: 0, cursor: afterInternalId, customers: [] };

	return {
		selectedCount: rows.length,
		cursor: rows[rows.length - 1].internal_id,
		customers: rows
			.filter((row) => row.claimed)
			.map((row) => ({
				internalId: row.internal_id,
				id: row.id,
				name: row.name,
				email: row.email,
			})),
	};
};
