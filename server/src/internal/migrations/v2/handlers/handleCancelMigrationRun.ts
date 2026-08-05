import {
	ErrCode,
	MigrationRunStatus,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { runs } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import { setMigrationCancelRequested } from "@/external/redis/actions/migrationCancelToken/migrationCancelToken.js";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { settleLeftoverClaims } from "@/internal/migrations/v2/actions/migrationRun/index.js";
import { isTriggerRunTerminal } from "@/internal/migrations/v2/actions/migrationRun/triggerRunLiveness.js";
import {
	migrationRepo,
	migrationRunRepo,
} from "@/internal/migrations/v2/repos/index.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { isTriggerConfigured } from "@/trigger/configureTrigger.js";

const CancelMigrationRunBody = z.object({
	id: z.string(),
});

/** POST /migrations.cancel_run — request cancellation of the active
 *  migration_run for a migration, if any. Sets a cache token so in-flight
 *  items finish but no new items start. Lazy runs are marked `canceled`
 *  immediately (and the org cache cleared) so no further per-customer tasks
 *  are enqueued; batch runs settle to `canceled` once their runner drains.
 *  Errors if no active run exists. */
export const handleCancelMigrationRun = createRoute({
	scopes: [Scopes.Migrations.Write],
	body: CancelMigrationRunBody,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { id } = c.req.valid("json");

		const migration = await migrationRepo.find({ ctx, id });

		const activeRuns = await migrationRunRepo.list({
			ctx,
			migrationInternalId: migration.internal_id,
			active: true,
		});
		const activeRun = activeRuns[0];

		if (!activeRun) {
			throw new RecaseError({
				message: `No active migration run for ${id}`,
				code: ErrCode.InvalidRequest,
				statusCode: 404,
			});
		}

		await setMigrationCancelRequested({
			ctx,
			migrationRunId: activeRun.internal_id,
		});

		// Trigger-dispatched runs: kill the task, then settle the row — but only
		// once the platform confirms it stopped (a settled row releases the run
		// claim, so a still-live task must never be left behind it). Runs with
		// no trigger handle keep the cooperative flag-only behavior.
		if (
			!activeRun.lazy_run &&
			activeRun.trigger_run_id &&
			isTriggerConfigured()
		) {
			let triggerStopped = false;
			try {
				await runs.cancel(activeRun.trigger_run_id);
				triggerStopped = true;
			} catch {
				triggerStopped = await isTriggerRunTerminal({
					ctx,
					triggerRunId: activeRun.trigger_run_id,
				});
			}
			if (triggerStopped) {
				await migrationRunRepo.update({
					ctx,
					internalId: activeRun.internal_id,
					updates: {
						status: MigrationRunStatus.Canceled,
						error_message: "Canceled by user",
						finished_at: Date.now(),
					},
				});
				// A stopped task will never drain its claims; release them so
				// the live-item mutex stops blocking other migrations.
				await settleLeftoverClaims({
					ctx,
					migrationRunId: activeRun.internal_id,
				});
			}
		}

		// Lazy runs have no batch loop to drain. Mark them canceled now and clear
		// the org cache so `pendingMigrations` drops this run and the customer
		// hot path stops enqueuing per-customer tasks. Batch runs are settled to
		// `canceled` by their own runner (withMigrationRunTracking) after the
		// in-flight items finish.
		if (activeRun.lazy_run) {
			await migrationRunRepo.update({
				ctx,
				internalId: activeRun.internal_id,
				updates: {
					status: MigrationRunStatus.Canceled,
					error_message: "Canceled by user",
					finished_at: Date.now(),
				},
			});

			await clearOrgCache({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
				logger: ctx.logger,
			});
		}

		return c.json({
			migration_id: id,
			run_id: activeRun.internal_id,
			canceled: true,
		});
	},
});
