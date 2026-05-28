import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { auth } from "@trigger.dev/sdk/v3";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { withMigrationRunClaim } from "@/internal/migrations/v2/actions/migrationRun/index.js";
import { prepare } from "@/internal/migrations/v2/prepare/index.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { runMigrationTask } from "@/trigger/migrations/runMigrationTask.js";

const RunMigrationBody = z.object({
	id: z.string(),
	dry_run: z.boolean().default(false),
	limit: z.number().int().min(1).optional(),
	only: z.array(z.string()).optional(),
	concurrency: z.number().int().min(1).optional(),
	/** When true, claim a lazy run alongside the background sweeper. Customers
	 *  hit on the request path get migrated lazily via `runMigrationCustomerTask`
	 *  before the sweeper reaches them. Background and lazy run on the same
	 *  migration_run row — the claim is shared. */
	lazy_run: z.boolean().default(false),
});

const getRunMigrationTriggerOptions = ({
	orgId,
	isDev,
}: {
	orgId: string;
	isDev: boolean;
}) => ({
	...(isDev ? { region: "eu-central-1" } : {}),
	concurrencyKey: orgId,
});

export const handleRunMigration = createRoute({
	scopes: [Scopes.Migrations.Write],
	body: RunMigrationBody,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const {
			id,
			dry_run: dryRun,
			limit,
			only,
			concurrency,
			lazy_run: lazyRun,
		} = c.req.valid("json");

		const migration = await migrationRepo.find({ ctx, id });

		if (!migration.operations)
			throw new RecaseError({
				message: `Migration ${id} has no operations to run`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});

		if (lazyRun && only && only.length > 0) {
			throw new RecaseError({
				message:
					"Migration lazy_run cannot be combined with only. Run targeted customers without lazy_run.",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const isDev = process.env.NODE_ENV === "development";
		const { migrationRunId, triggerRunId } = await withMigrationRunClaim({
			ctx,
			migration,
			dryRun,
			lazyRun,
			onlyIds: only,
			targetLimit: limit,
			claimed: async (migrationRunId) => {
				if (lazyRun && !dryRun) {
					await prepare({ ctx, migration, dryRun: false });
				}
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

		let publicAccessToken: string | undefined;
		if (triggerRunId) {
			try {
				publicAccessToken = await auth.createPublicToken({
					scopes: { read: { runs: [triggerRunId] } },
					expirationTime: "1hr",
				});
			} catch {
				ctx.logger.warn("run-migration: failed to create public access token");
			}
		}

		return c.json({
			migration_id: id,
			dry_run: dryRun,
			lazy_run: lazyRun,
			run_id: migrationRunId,
			trigger_run_id: triggerRunId,
			public_access_token: publicAccessToken,
		});
	},
});
