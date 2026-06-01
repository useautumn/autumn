import {
	ErrCode,
	MigrationRunStatus,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { runs } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import {
	migrationRepo,
	migrationRunRepo,
} from "@/internal/migrations/v2/repos/index.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";

const CancelMigrationRunBody = z.object({
	id: z.string(),
});

/** POST /migrations.cancel_run — cancel the active migration_run for a
 *  migration, if any. Marks the run as `canceled` and best-effort
 *  cancels the trigger.dev task. Errors if no active run exists. */
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

		if (activeRun.trigger_run_id) {
			try {
				await runs.cancel(activeRun.trigger_run_id);
			} catch (error) {
				ctx.logger.warn(
					"cancel-migration-run: trigger.dev cancel failed (continuing to mark canceled)",
					{
						data: {
							runId: activeRun.internal_id,
							triggerRunId: activeRun.trigger_run_id,
							error: error instanceof Error ? error.message : String(error),
						},
					},
				);
			}
		}

		await migrationRunRepo.update({
			ctx,
			internalId: activeRun.internal_id,
			updates: {
				status: MigrationRunStatus.Canceled,
				error_message: "Canceled by user",
				finished_at: Date.now(),
			},
		});

		if (activeRun.lazy_run) {
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
