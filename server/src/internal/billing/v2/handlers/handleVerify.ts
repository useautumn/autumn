import { Scopes, VerifyParamsV1Schema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { billingActions } from "@/internal/billing/v2/actions";

export const handleVerify = createRoute({
	scopes: [Scopes.Billing.Read],
	body: VerifyParamsV1Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const result = await billingActions.verify({
			ctx,
			params: body,
		});

		return c.json(result, 200);
	},
});
