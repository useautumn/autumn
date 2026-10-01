import {
	AllocateBalancesParamsV0Schema,
	RouteGroup,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { allocateBalances } from "../allocate/allocateBalances.js";

export const handleAllocateBalances = createRoute({
	scopes: [Scopes.Balances.Write],
	routeGroup: RouteGroup.Balances,
	body: AllocateBalancesParamsV0Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");
		return c.json(await allocateBalances({ ctx, params }));
	},
});
