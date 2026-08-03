import {
	ErrCode,
	type Migration,
	MigrationRunStatus,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { migrationRunRepo } from "../../repos/index.js";

/** Two-phase claim for a migration run.
 *
 *  1. Insert with `status='queued'` — the partial unique index (one live run
 *     per migration) blocks concurrent claims of the same migration.
 *  2. Run `claimed` (e.g. `prepare`, or trigger.dev dispatch).
 *  3. On success, flip to `status='running'` with `started_at=now` (note:
 *     dispatch ≠ execution — the per-org run queue may hold the trigger task
 *     behind another migration's run first). On failure, flip to `failed` so
 *     the constraint releases.
 *  4. `claimed` may return `{ triggerRunId }` to persist a handle. */
export const withMigrationRunClaim = async ({
	ctx,
	migration,
	dryRun,
	lazyRun = false,
	onlyIds,
	targetLimit,
	claimed,
}: {
	ctx: AutumnContext;
	migration: Migration;
	dryRun: boolean;
	lazyRun?: boolean;
	onlyIds?: string[] | null;
	targetLimit?: number;
	claimed: (
		migrationRunId: string,
	) => Promise<{ triggerRunId?: string } | undefined>;
}): Promise<{ migrationRunId: string; triggerRunId?: string }> => {
	const migrationRun = await migrationRunRepo.insert({
		ctx,
		insert: {
			migration_internal_id: migration.internal_id,
			dry_run: dryRun,
			lazy_run: lazyRun,
			only_ids: onlyIds && onlyIds.length > 0 ? onlyIds : null,
			target_limit: targetLimit,
		},
	});

	if (!migrationRun) {
		throw new RecaseError({
			message:
				"A migration is already running. Please try again when it completes.",
			code: ErrCode.MigrationAlreadyInProgress,
			statusCode: 409,
		});
	}

	let result: { triggerRunId?: string } | undefined;
	try {
		result = await claimed(migrationRun.internal_id);
	} catch (error) {
		await migrationRunRepo.update({
			ctx,
			internalId: migrationRun.internal_id,
			updates: {
				status: MigrationRunStatus.Failed,
				error_message: error instanceof Error ? error.message : String(error),
				finished_at: Date.now(),
			},
		});
		throw error;
	}

	await migrationRunRepo.update({
		ctx,
		internalId: migrationRun.internal_id,
		updates: {
			status: MigrationRunStatus.Running,
			started_at: Date.now(),
		},
	});

	if (result?.triggerRunId) {
		try {
			await migrationRunRepo.update({
				ctx,
				internalId: migrationRun.internal_id,
				updates: { trigger_run_id: result.triggerRunId },
			});
		} catch (error) {
			ctx.logger.error("run-migration: failed to persist trigger run id", {
				data: {
					migrationRunId: migrationRun.internal_id,
					triggerRunId: result.triggerRunId,
					error: error instanceof Error ? error.message : String(error),
				},
			});
		}
	}

	// Publish lazy-mode runs only after claim setup succeeds, so customer
	// request-path tasks cannot observe a migration before prepare completes.
	if (lazyRun) {
		await clearOrgCache({ db: ctx.db, orgId: ctx.org.id, env: ctx.env });
	}

	return {
		migrationRunId: migrationRun.internal_id,
		triggerRunId: result?.triggerRunId,
	};
};
