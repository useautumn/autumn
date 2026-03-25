import {
	AffectedResource,
	ApiVersion,
	ListCustomersQuerySchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusBatchService } from "../CusBatchService.js";

export const handleListCustomers = createRoute({
	versionedQuery: {
		latest: ListCustomersQuerySchema,
		[ApiVersion.V1_2]: ListCustomersQuerySchema,
	},
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const query = c.req.valid("query");

		const customers = await CusBatchService.getPage({ ctx, query });
		const totalCustomerCount = await CusService.countByOrgIdAndEnv({ ctx });

		return c.json({
			list: customers,
			total: customers.length,
			total_customer_count: totalCustomerCount.total_customer_count,
			limit: query.limit,
			offset: query.offset,
		});
	},
});
