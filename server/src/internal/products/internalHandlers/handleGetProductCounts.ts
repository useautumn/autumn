import { createRoute } from "@/honoMiddlewares/routeHandler";
import { Scopes } from "@autumn/shared";
import { CusProdReadService } from "@/internal/customers/cusProducts/CusProdReadService";

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
