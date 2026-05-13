import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { withMigrationRunClaim } from "@/internal/migrations/v2/actions/migrationRun/index.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { runMigrationTask } from "@/trigger/migrations/runMigrationTask.js";

const RunMigrationBody = z.object({
	id: z.string(),
	dry_run: z.boolean().default(false),
	limit: z.number().int().min(1).optional(),
	only: z.array(z.string()).optional(),
	concurrency: z.number().int().min(1).optional(),
});

const getRunMigrationTriggerOptions = ({
	orgId,
	isDev,
}: {
	orgId: string;
	isDev: boolean;
}) => ({
	...(isDev ? { region: "eu-west-1" } : {}),
	concurrencyKey: orgId,
});

export const handleRunMigration = createRoute({
	scopes: [Scopes.Migrations.Write],
	body: RunMigrationBody,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { id, dry_run: dryRun, limit, only, concurrency } = c.req.valid("json");

		const migration = await migrationRepo.find({ ctx, id });

		if (!migration.operations)
			throw new RecaseError({
				message: `Migration ${id} has no operations to run`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});

		const isDev = process.env.NODE_ENV === "development";
		const { migrationRunId } = await withMigrationRunClaim({
			ctx,
			migration,
			dryRun,
			claimed: async (migrationRunId) => {
				const handle = await runMigrationTask.trigger(
					{
						orgId: ctx.org.id,
						env: ctx.env,
						migrationId: id,
						migrationRunId,
						dryRun,
						controls: { limit, only, concurrency },
					},
					getRunMigrationTriggerOptions({
						orgId: ctx.org.id,
						isDev,
					}),
				);
				return { triggerRunId: handle.id };
			},
		});

		return c.json({
			migration_id: id,
			dry_run: dryRun,
			run_id: migrationRunId,
		});
	},
});
