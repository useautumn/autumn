import { Scopes, SyncParamsV1Schema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { billingActions } from "@/internal/billing/v2/actions";

export const handleSyncV2 = createRoute({
	scopes: [Scopes.Billing.Write],
	body: SyncParamsV1Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const result = await billingActions.syncV2({
			ctx,
			params: body,
		});

		return c.json(result, 200);
	},
});
