import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { listMigrationCustomerCounts } from "@/internal/migrations/v2/actions/migrationList/listMigrationCustomerCounts.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";

/** POST /migrations.customer_counts — each migration's `summary.customer_count`, apart from the list. */
export const handleListMigrationCustomerCounts = createRoute({
	scopes: [Scopes.Migrations.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const migrations = await migrationRepo.get({ ctx });
		const counts = await listMigrationCustomerCounts({ ctx, migrations });

		return c.json({
			list: migrations.map((migration) => ({
				id: migration.id,
				customer_count: counts.get(migration.internal_id) ?? null,
			})),
		});
	},
});
