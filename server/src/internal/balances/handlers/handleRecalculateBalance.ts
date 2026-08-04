import {
	RecalculateBalanceParamsV0Schema,
	RouteGroup,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { recalculateBalance } from "../recalculateBalance/recalculateBalance";

export const handleRecalculateBalance = createRoute({
	scopes: [Scopes.Balances.Write],
	routeGroup: RouteGroup.Balances,
	body: RecalculateBalanceParamsV0Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		await recalculateBalance({
			ctx,
			params,
		});

		return c.json({ success: true });
	},
});
