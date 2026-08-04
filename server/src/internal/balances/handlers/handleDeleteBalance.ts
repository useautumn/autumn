import {
	DeleteBalanceParamsV0Schema,
	RouteGroup,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { deleteBalance } from "../deleteBalance/deleteBalance";

export const handleDeleteBalance = createRoute({
	scopes: [Scopes.Balances.Write],
	routeGroup: RouteGroup.Balances,
	body: DeleteBalanceParamsV0Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		await deleteBalance({
			ctx,
			params,
		});

		return c.json({ success: true });
	},
});
