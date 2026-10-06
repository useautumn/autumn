import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { computeMigrationListItem } from "@/internal/migrations/v2/actions/migrationList/computeMigrationListItem.js";
import { setupMigrationListContext } from "@/internal/migrations/v2/actions/migrationList/setupMigrationListContext.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";

/** POST /migrations.list — list migrations for the current org + env. */
export const handleListMigrations = createRoute({
	scopes: [Scopes.Migrations.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const migrations = await migrationRepo.get({ ctx });

		if (migrations.length === 0) return c.json({ list: [] });

		const listContext = await setupMigrationListContext({ ctx, migrations });
		const list = migrations.map((migration) =>
			computeMigrationListItem({ ctx, migration, listContext }),
		);

		return c.json({ list });
	},
});
