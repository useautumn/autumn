import { AppEnv } from "@autumn/shared";
import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import { withMigrationRunTracking } from "@/internal/migrations/v2/actions/migrationRun/index.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { runMigration } from "@/internal/migrations/v2/run/runMigration.js";
import { createTriggerContext } from "@/trigger/utils/createTriggerContext.js";

const PayloadSchema = z.object({
	orgId: z.string(),
	env: z.enum(AppEnv),
	migrationId: z.string(),
	migrationRunId: z.string(),
	dryRun: z.boolean().default(false),
});

export type RunMigrationPayload = z.infer<typeof PayloadSchema>;

export const runMigrationTaskQueue = {
	concurrencyLimit: 1,
};

export const runMigrationTask = task({
	id: "run-migration",
	queue: runMigrationTaskQueue,
	maxDuration: 3600,
	run: async (rawPayload: unknown, { ctx: triggerCtx }) => {
		const { orgId, env, migrationId, migrationRunId, dryRun } =
			PayloadSchema.parse(rawPayload);

		const { ctx, logger } = await createTriggerContext({
			orgId,
			env,
			triggerCtx,
		});

		logger.info("run-migration: starting", {
			data: { migrationId, dryRun },
		});

		await withMigrationRunTracking({
			ctx,
			migrationRunId,
			run: async () => {
				const migration = await migrationRepo.find({ ctx, id: migrationId });

				await runMigration({
					ctx,
					migration,
					dryRun,
					migrationRunId,
				});
			},
		});

		logger.info("run-migration: done", {
			data: {
				migrationId,
				dryRun,
			},
		});
	},
});
