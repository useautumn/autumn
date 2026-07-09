import { Scopes, SyncParamsV1Schema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { billingActions } from "@/internal/billing/v2/actions";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook";

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

		// Emit billing.updated webhook for manual sync operations
		if (result._internal) {
			void sendBillingUpdatedWebhook({
				ctx,
				autumnBillingPlan: result._internal.autumnBillingPlan,
				originalFullCustomer: result._internal.fullCustomer,
				tags: ["reconciled"],
			});
		}

		// Strip internal data from API response
		const { _internal, ...publicResult } = result;
		return c.json(publicResult, 200);
	},
});
