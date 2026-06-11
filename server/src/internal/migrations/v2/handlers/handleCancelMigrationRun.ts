import {
	ErrCode,
	MigrationRunStatus,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import {
	migrationRepo,
	migrationRunRepo,
} from "@/internal/migrations/v2/repos/index.js";
import { setMigrationCancelRequested } from "@/internal/migrations/v2/run/utils/migrationCancelToken.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";

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

		await setMigrationCancelRequested({ migrationRunId: activeRun.internal_id });

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
