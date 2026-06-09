import { Scopes } from "@autumn/shared";
import { MigrationFilterSchema } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import { OperationsSchema } from "@autumn/shared/api/migrations/operations/operations.js";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";

const CreateMigrationBody = z.object({
	id: z.string().min(1).max(200),
	filter: MigrationFilterSchema.nullable().optional(),
	operations: OperationsSchema.nullable().optional(),
	no_billing_changes: z.boolean().optional(),
});

/** POST /migrations.create — create a draft migration. */
export const handleCreateMigration = createRoute({
	scopes: [Scopes.Migrations.Write],
	body: CreateMigrationBody,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const insert = c.req.valid("json");

		const migration = await migrationRepo.insert({ ctx, insert });

		return c.json(migration);
	},
});
