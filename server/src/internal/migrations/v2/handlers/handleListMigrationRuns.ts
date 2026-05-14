import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { migrationRepo, migrationRunRepo } from "../repos/index.js";

const ListMigrationRunsBody = z.object({
	migrationId: z.string(),
});

export const handleListMigrationRuns = createRoute({
	scopes: [Scopes.Migrations.Read],
	body: ListMigrationRunsBody,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { migrationId } = c.req.valid("json");
		const migration = await migrationRepo.find({ ctx, id: migrationId });
		const runs = await migrationRunRepo.list({
			ctx,
			migrationInternalId: migration.internal_id,
		});

		return c.json({ list: runs });
	},
});
