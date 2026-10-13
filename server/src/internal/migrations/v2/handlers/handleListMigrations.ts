import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { computeMigrationListItem } from "@/internal/migrations/v2/actions/migrationList/computeMigrationListItem.js";
import { setupMigrationListContext } from "@/internal/migrations/v2/actions/migrationList/setupMigrationListContext.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";

const ListMigrationsBody = z.object({
	/** False leaves `summary.customer_count` null; read it from `migrations.customer_counts`. */
	customer_counts: z.boolean().default(true),
});

/** POST /migrations.list — list migrations for the current org + env. */
export const handleListMigrations = createRoute({
	scopes: [Scopes.Migrations.Read],
	body: ListMigrationsBody,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_counts } = c.req.valid("json");
		const migrations = await migrationRepo.get({ ctx });

		if (migrations.length === 0) return c.json({ list: [] });

		const listContext = await setupMigrationListContext({
			ctx,
			migrations,
			includeCustomerCounts: customer_counts,
		});
		const list = migrations.map((migration) =>
			computeMigrationListItem({ ctx, migration, listContext }),
		);

		return c.json({ list });
	},
});
