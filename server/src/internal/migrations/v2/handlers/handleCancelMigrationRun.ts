import {
	ErrCode,
	MigrationRunErrorCode,
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
						error_code: MigrationRunErrorCode.Canceled,
						finished_at: Date.now(),
					},
				});
				await settleLeftoverClaims({
					ctx,
					migrationRunId: activeRun.internal_id,
				});
			}
		}

		if (activeRun.lazy_run) {
			await migrationRunRepo.update({
				ctx,
				internalId: activeRun.internal_id,
				updates: {
					status: MigrationRunStatus.Canceled,
					error_message: "Canceled by user",
					error_code: MigrationRunErrorCode.Canceled,
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
