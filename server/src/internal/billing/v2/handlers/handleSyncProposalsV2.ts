import { Scopes, SyncProposalsV2ParamsSchema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { billingActions } from "@/internal/billing/v2/actions";

export const handleSyncProposalsV2 = createRoute({
	scopes: [Scopes.Billing.Read],
	body: SyncProposalsV2ParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const result = await billingActions.syncProposalsV2({
			ctx,
			params: body,
		});

		return c.json(result, 200);
	},
});
