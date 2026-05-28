import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { MigrationFilterSchema } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import { OperationsSchema } from "@autumn/shared/api/migrations/operations/operations.js";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";

const PatchMigrationBody = z.object({
	id: z.string(),
	updates: z.object({
		id: z.string().min(1).max(200).optional(),
		filter: MigrationFilterSchema.nullable().optional(),
		operations: OperationsSchema.nullable().optional(),
		retry_failed: z.boolean().optional(),
		no_billing_changes: z.boolean().nullable().optional(),
	}),
});

/** POST /migrations.update — patch a migration's fields. */
export const handlePatchMigration = createRoute({
	scopes: [Scopes.Migrations.Write],
	body: PatchMigrationBody,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { id, updates } = c.req.valid("json");

		const updated = await migrationRepo.update({
			ctx,
			id,
			updates: {
				...updates,
				...(updates.operations !== undefined ? { prepared_state: null } : {}),
			},
		});

		if (!updated)
			throw new RecaseError({
				message: `Migration ${id} not found`,
				code: ErrCode.MigrationNotFound,
				statusCode: 404,
			});

		return c.json(updated);
	},
});
