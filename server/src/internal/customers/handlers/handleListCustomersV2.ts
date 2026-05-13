import {
	AffectedResource,
	ApiVersion,
	type BaseApiCustomerV5,
	type CursorPaginatedResponse,
	ErrCode,
	ListCustomersV2_3ParamsSchema,
	type ListCustomersV2Params,
	ListCustomersV2ParamsSchema,
	type PagePaginatedResponse,
	PaginationType,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import type { Context } from "hono";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { getOrgPaginationMaxLimit } from "../../misc/edgeConfig/orgLimitsStore.js";
import { CusBatchService } from "../CusBatchService.js";
import { CusService } from "../CusService.js";

const runOffsetListCustomers = async ({
	c,
	body,
}: {
	c: Context<HonoEnv>;
	body: ListCustomersV2Params;
}) => {
	const ctx = c.get("ctx");
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
};

export const handleListCustomersV2 = createRoute({
	scopes: [Scopes.Customers.Read],
	versionedBody: {
		latest: ListCustomersV2_3ParamsSchema,
		[ApiVersion.V2_2]: ListCustomersV2ParamsSchema,
	},
	versionedHandler: {
		latest: async (c) => {
			const ctx = c.get("ctx");
			const body = c.req.valid("json");

			const maxLimit = getOrgPaginationMaxLimit({
				orgId: ctx.org.id,
				orgSlug: ctx.org.slug,
				type: PaginationType.ListCustomers,
			});
			if (body.limit > maxLimit) {
				throw new RecaseError({
					message: `limit ${body.limit} exceeds max of ${maxLimit} for this org`,
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			const page = await CusBatchService.getCursorPage({ ctx, query: body });

			return c.json<CursorPaginatedResponse<BaseApiCustomerV5>>(page);
		},
		[ApiVersion.V2_2]: async (c) =>
			runOffsetListCustomers({ c, body: c.req.valid("json") }),
	},
	resource: AffectedResource.Customer,
});
