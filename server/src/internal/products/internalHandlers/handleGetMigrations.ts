import { createRoute } from "@/honoMiddlewares/routeHandler";
import { Scopes } from "@autumn/shared";
import { MigrationService } from "@/internal/migrations/MigrationService";

/**
 * GET /products/migrations
 * Used by: vite/src/views/products/product/hooks/queries/useMigrationsQuery.tsx.tsx
 */
export const handleGetMigrations = createRoute({
	scopes: [Scopes.Plans.Read],
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");

		const migrations = await MigrationService.getExistingJobs({
			db,
			orgId: org.id,
			env,
		});

		return c.json({ migrations });
	},
});
