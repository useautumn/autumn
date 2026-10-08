import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { listMigrationProducts } from "../actions/migrationList/listMigrationProducts.js";
import { migrationRepo } from "../repos/index.js";
import { isBatchEligibleMigrationDefinition } from "../utils/shouldRunBatchLane.js";

const GetMigrationBody = z.object({
	id: z.string(),
});

/** POST /migrations.get — one migration by user `id`, without the list's per-migration customer counts. */
export const handleGetMigration = createRoute({
	scopes: [Scopes.Migrations.Read],
	body: GetMigrationBody,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { id } = c.req.valid("json");

		const [migration] = await migrationRepo.get({ ctx, id });
		if (!migration)
			throw new RecaseError({
				message: `Migration ${id} not found`,
				code: ErrCode.MigrationNotFound,
				statusCode: 404,
			});

		const products = await listMigrationProducts({
			ctx,
			migrations: [migration],
		});

		return c.json({
			...migration,
			batch_eligible: isBatchEligibleMigrationDefinition({
				migration,
				products,
				features: ctx.features,
			}),
		});
	},
});
