import { RecalculateBalanceParamsV0Schema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { recalculateBalance } from "../recalculateBalance/recalculateBalance";

export const handleRecalculateBalance = createRoute({
	scopes: [Scopes.Balances.Write],
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
