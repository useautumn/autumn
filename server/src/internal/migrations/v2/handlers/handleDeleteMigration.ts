import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";

const DeleteMigrationBody = z.object({
	id: z.string(),
});

/** POST /migrations.delete — delete by user `id`. */
export const handleDeleteMigration = createRoute({
	scopes: [Scopes.Migrations.Write],
	body: DeleteMigrationBody,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { id } = c.req.valid("json");

		const deleted = await migrationRepo.delete({ ctx, id });
		if (!deleted)
			throw new RecaseError({
				message: `Migration ${id} not found`,
				code: ErrCode.MigrationNotFound,
				statusCode: 404,
			});

		return c.json(deleted);
	},
});
