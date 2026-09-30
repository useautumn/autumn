import {
	ListBalancesParamsSchema,
	type ListBalancesResponse,
	RouteGroup,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { listBalances } from "../actions/listBalances.js";

export const handleListBalancesV2 = createRoute({
	scopes: [Scopes.Balances.Read],
	routeGroup: RouteGroup.Balances,
	body: ListBalancesParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");
		const page = await listBalances({ ctx, params });
		return c.json<ListBalancesResponse>(page);
	},
});
