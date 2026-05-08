import { AppEnv } from "@autumn/shared";
import { task } from "@trigger.dev/sdk/v3";
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

/** trigger.dev task for long-running migrations (deploys kill api workers). */
export const runMigrationTask = task({
	id: "run-migration",
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

		const migration = await migrationRepo.find({ ctx, id: migrationId });

		const result = await runMigration({ ctx, migration, dry_run: dryRun });

		logger.info("run-migration: done", {
			data: {
				migration_id: result.migration_id,
				dry_run: result.dry_run,
				scopes: result.scopes.map((s) => ({
					kind: s.kind,
					count: s.count,
					succeeded: s.summary.succeeded,
					failed: s.summary.failed,
				})),
			},
		});
		return result;
	},
});
