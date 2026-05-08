import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { runPrepare } from "@/internal/migrations/v2/prepare/index.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";

const PrepareMigrationBody = z.object({
	id: z.string(),
	dry_run: z.boolean(),
});

/** POST /migrations.prepare — run prep modules for a migration. */
export const handlePrepareMigration = createRoute({
	scopes: [Scopes.Migrations.Write],
	body: PrepareMigrationBody,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { id, dry_run } = c.req.valid("json");

		const migration = await migrationRepo.find({ ctx, id });

		if (!migration.operations)
			throw new RecaseError({
				message: `Migration ${id} has no operations to prepare`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});

		const { response } = await runPrepare({ ctx, migration, dry_run });
		return c.json(response);
	},
});
