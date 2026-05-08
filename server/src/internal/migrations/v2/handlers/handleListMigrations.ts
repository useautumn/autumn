import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";

/** POST /migrations.list — list migrations for the current org + env. */
export const handleListMigrations = createRoute({
	scopes: [Scopes.Migrations.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const migrations = await migrationRepo.get({ ctx });
		return c.json({ list: migrations });
	},
});
