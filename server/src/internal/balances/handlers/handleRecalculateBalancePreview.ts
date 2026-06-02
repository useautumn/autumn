import { RecalculateBalanceParamsV0Schema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { recalculateBalancePreview } from "../recalculateBalance/recalculateBalancePreview";

export const handleRecalculateBalancePreview = createRoute({
	scopes: [Scopes.Balances.Read],
	body: RecalculateBalanceParamsV0Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		const preview = await recalculateBalancePreview({
			ctx,
			params,
		});

		return c.json(preview);
	},
});
