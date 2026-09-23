import { Scopes, SyncParamsV1Schema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { billingActions } from "@/internal/billing/v2/actions";

export const handlePreviewSyncV2 = createRoute({
	scopes: [Scopes.Billing.Read],
	body: SyncParamsV1Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const result = await billingActions.previewSyncV2({
			ctx,
			params: body,
		});

		return c.json(result, 200);
	},
});
