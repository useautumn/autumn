import {
	AffectedResource,
	ApiVersion,
	type BaseApiCustomerV5,
	ListCustomersV2ParamsSchema,
	type PagePaginatedResponse,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusBatchService } from "../CusBatchService.js";
import { CusService } from "../CusService.js";

export const handleListCustomersV2 = createRoute({
	scopes: [Scopes.Customers.Read],
	versionedBody: {
		latest: ListCustomersV2ParamsSchema,
		[ApiVersion.V2_0]: ListCustomersV2ParamsSchema,
	},
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const hasFilteredQuery = Boolean(
			body.plans?.length ||
				body.search?.trim() ||
				body.subscription_status ||
				body.processors?.length,
		);

		const [customers, totalCount] = await Promise.all([
			CusBatchService.getPage({ ctx, query: body }),
			CusService.countByOrgIdAndEnv({ ctx }),
		]);

		const totalFilteredCount = hasFilteredQuery
			? await CusService.countFilteredByOrgIdAndEnv({
					ctx,
					query: {
						plans: body.plans,
						search: body.search,
						subscription_status: body.subscription_status,
						processors: body.processors,
					},
				})
			: { total_filtered_count: totalCount.total_count };

		const hasMore = customers.length === body.limit;

		return c.json<
			PagePaginatedResponse<BaseApiCustomerV5> & {
				total_count: number;
				total_filtered_count: number;
			}
		>({
			list: customers,
			total: customers.length,
			total_count: totalCount.total_count,
			total_filtered_count: totalFilteredCount.total_filtered_count,
			limit: body.limit,
			offset: body.offset,
			has_more: hasMore,
		});
	},
});
