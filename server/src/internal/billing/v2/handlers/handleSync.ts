import { SyncParamsV0Schema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { billingActions } from "@/internal/billing/v2/actions";

export const handleSync = createRoute({
	scopes: [Scopes.Billing.Write],
	body: SyncParamsV0Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const result = await billingActions.sync({
			ctx,
			params: body,
		});

		return c.json(result, 200);
	},
});
