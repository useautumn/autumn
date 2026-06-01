import { createRoute } from "@/honoMiddlewares/routeHandler";
import { Scopes } from "@autumn/shared";
import { CusProdReadService } from "@/internal/customers/cusProducts/CusProdReadService";

/**
 * GET /products/product_counts
 * Used by: vite/src/hooks/queries/useProductsQuery.tsx
 */
export const handleGetProductCounts = createRoute({
	scopes: [Scopes.Plans.Read],
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");

		const result = await CusProdReadService.getCountsForAllProductsInOrg({
			db,
			orgId: org.id,
			env,
		});

		return c.json(result);
	},
});
