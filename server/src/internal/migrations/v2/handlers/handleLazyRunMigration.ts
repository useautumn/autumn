import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { checkRouteApproval } from "@/internal/approvals/check/checkRouteApproval";
import { withMigrationRunClaim } from "@/internal/migrations/v2/actions/migrationRun/index.js";
import { prepare } from "@/internal/migrations/v2/prepare/index.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { LAZY_MIGRATION_RUNS_DISABLED } from "@/internal/migrations/v2/run/utils/migrationRunConstants.js";

const LazyRunMigrationBody = z.object({
	id: z.string(),
});

/** POST /migrations.lazy_run — start a migration in lazy mode.
 *  Reuses `withMigrationRunClaim` so the partial unique index enforces one
 *  active run per (org, env), and prepare rolls back the claim on failure. */
export const handleLazyRunMigration = createRoute({
	scopes: [Scopes.Migrations.Write],
	body: LazyRunMigrationBody,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { id } = c.req.valid("json");

		if (LAZY_MIGRATION_RUNS_DISABLED) {
			throw new RecaseError({
				message: "Lazy migration runs are disabled.",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const migration = await migrationRepo.find({ ctx, id });

		if (!migration.operations)
			throw new RecaseError({
				message: `Migration ${id} has no operations to run`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});

		// A lazy run is gated by the same rules as `migrations.run`.
		await checkRouteApproval({
			ctx,
			action: "migrations.run",
			buildFacts: async () => null,
		});

		const { migrationRunId } = await withMigrationRunClaim({
			ctx,
			migration,
			dryRun: false,
			lazyRun: true,
			claimed: async () => {
				await prepare({ ctx, migration, dryRun: false });
			},
		});

		return c.json({
			migration_id: id,
			run_id: migrationRunId,
		});
	},
});
