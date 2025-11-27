import {
	AffectedResource,
	ApiVersion,
	ListCustomersQuerySchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
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

		const { limit = 10, offset = 0 } = query;

		// Note: expand and statuses are not exposed in the query params for list endpoint
		const statuses: any[] = [];

		const customers = await CusBatchService.getPage({
			ctx,
			limit,
			offset,
			statuses,
		});

		return c.json({
			list: customers,
			total: customers.length,
			limit,
			offset,
		});
	},
});
