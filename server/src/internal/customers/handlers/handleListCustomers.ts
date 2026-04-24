import {
	AffectedResource,
	ApiVersion,
	ListCustomersQuerySchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusBatchService } from "../CusBatchService.js";

export const handleListCustomers = createRoute({
	scopes: [Scopes.Customers.Read],
	versionedQuery: {
		latest: ListCustomersQuerySchema,
		[ApiVersion.V1_2]: ListCustomersQuerySchema,
	},
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const query = c.req.valid("query");

		const [customers, totalCount] = await Promise.all([
			CusBatchService.getPage({ ctx, query }),
			CusService.countByOrgIdAndEnv({ ctx }),
		]);

		return c.json({
			list: customers,
			total: customers.length,
			total_count: totalCount.total_count,
			total_filtered_count: totalCount.total_count,
			limit: query.limit,
			offset: query.offset,
		});
	},
});
