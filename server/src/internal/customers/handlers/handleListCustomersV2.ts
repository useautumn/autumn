import {
	AffectedResource,
	ApiVersion,
	type BaseApiCustomerV4,
	ListCustomersV2ParamsSchema,
	type PagePaginatedResponse,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusBatchService } from "../CusBatchService.js";

export const handleListCustomersV2 = createRoute({
	versionedBody: {
		latest: ListCustomersV2ParamsSchema,
		[ApiVersion.V2_0]: ListCustomersV2ParamsSchema,
	},
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const customers = await CusBatchService.getPage({ ctx, query: body });

		const hasMore = customers.length === body.limit;

		return c.json<PagePaginatedResponse<BaseApiCustomerV4>>({
			list: customers,
			total: customers.length,
			limit: body.limit,
			offset: body.offset,
			has_more: hasMore,
		});
	},
});
