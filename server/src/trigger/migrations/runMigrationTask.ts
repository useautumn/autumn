import { AppEnv } from "@autumn/shared";
import { idempotencyKeys, task } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { runMigration } from "@/internal/migrations/v2/run/runMigration.js";
import { createTriggerContext } from "@/trigger/utils/createTriggerContext.js";

const PayloadSchema = z.object({
	orgId: z.string(),
	env: z.enum(AppEnv),
	migrationId: z.string(),
	dryRun: z.boolean().default(false),
});

export type RunMigrationPayload = z.infer<typeof PayloadSchema>;

export const getRunMigrationIdempotencyKey = ({
	orgId,
	env,
}: {
	orgId: string;
	env: AppEnv;
}) => ["run-migration", orgId, env];

export const runMigrationTaskQueue = {
	concurrencyLimit: 1,
};

export const runMigrationTask = task({
	id: "run-migration",
	queue: runMigrationTaskQueue,
	maxDuration: 3600,
	run: async (rawPayload: unknown, { ctx: triggerCtx }) => {
		const { orgId, env, migrationId, dryRun } = PayloadSchema.parse(rawPayload);

		const { ctx, logger } = await createTriggerContext({
			orgId,
			env,
			triggerCtx,
		});

		logger.info("run-migration: starting", {
			data: { migrationId, dryRun },
		});

		try {
			const migration = await migrationRepo.find({ ctx, id: migrationId });

			await runMigration({
				ctx,
				migration,
				dryRun,
				migrationRunId: triggerCtx.run.id,
			});

			logger.info("run-migration: done", {
				data: {
					migrationId,
					dryRun,
				},
			});
		} finally {
			try {
				await idempotencyKeys.reset(
					"run-migration",
					getRunMigrationIdempotencyKey({ orgId, env }),
					{ scope: "global" },
				);
			} catch (error) {
				logger.error("run-migration: failed to reset idempotency key", {
					data: { migrationId, error },
				});
			}
		}
	},
});
