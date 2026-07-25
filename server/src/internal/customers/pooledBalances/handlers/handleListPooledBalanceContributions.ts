import {
	type ApiPooledBalanceContributionV0,
	ListPooledBalanceContributionsParamsV0Schema,
	type PagePaginatedResponse,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { pooledBalancesRepo } from "../repos/pooledBalancesRepo.js";

export const handleListPooledBalanceContributions = createRoute({
	scopes: [Scopes.Balances.Read],
	body: ListPooledBalanceContributionsParamsV0Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const { list, totalCount, totalFilteredCount } =
			await pooledBalancesRepo.listPooledBalanceContributionsPage({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
				pooledBalanceId: body.pooled_balance_id,
				offset: body.offset,
				limit: body.limit,
				search: body.search,
			});

		return c.json<
			PagePaginatedResponse<ApiPooledBalanceContributionV0> & {
				total_count: number;
				total_filtered_count: number;
			}
		>({
			list,
			total: list.length,
			total_count: totalCount,
			total_filtered_count: totalFilteredCount,
			limit: body.limit,
			offset: body.offset,
			has_more: body.offset + list.length < totalFilteredCount,
		});
	},
});
