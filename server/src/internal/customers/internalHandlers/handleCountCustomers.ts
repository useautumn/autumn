import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { CustomerListFiltersSchema } from "../customerListFilters";
import { CusSearchService } from "../CusSearchService";

export const handleCountCustomers = createRoute({
	scopes: [Scopes.Customers.Read],
	body: z.object({
		search: z.string().optional(),
		filters: CustomerListFiltersSchema.optional(),
	}),
	handler: async (c) => {
		const { db, org, env } = c.get("ctx");
		const { search, filters } = c.req.valid("json");

		const { totalCount } = await CusSearchService.count({
			db,
			orgId: org.id,
			env,
			search: search ?? "",
			filters,
		});

		return c.json({ totalCount });
	},
});
