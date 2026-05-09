import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { runMigrationTask } from "@/trigger/migrations/runMigrationTask.js";

const RunMigrationBody = z.object({
	id: z.string(),
	dry_run: z.boolean().default(false),
});

/**
 * POST /migrations.run — kick off a migration on trigger.dev. Returns the
 * trigger run handle so the dashboard can poll status. In dev we route
 * to EU so dev runs don't touch the production US region.
 */
export const handleRunMigration = createRoute({
	scopes: [Scopes.Migrations.Write],
	body: RunMigrationBody,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { id, dry_run: dryRun } = c.req.valid("json");

		const migration = await migrationRepo.find({ ctx, id });

		if (!migration.operations)
			throw new RecaseError({
				message: `Migration ${id} has no operations to run`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});

		const isDev = process.env.NODE_ENV === "development";

		const handle = await runMigrationTask.trigger(
			{
				orgId: ctx.org.id,
				env: ctx.env,
				migrationId: id,
				dryRun,
			},
			isDev ? { region: "eu-west-1" } : undefined,
		);

		return c.json({
			migration_id: id,
			dry_run: dryRun,
			run_id: handle.id,
		});
	},
});
