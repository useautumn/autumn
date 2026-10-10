import { SetupPaymentParamsV1Schema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { billingActions } from "@/internal/billing/v2/actions";
import { setRootSpanAttributes } from "@/utils/otel/rootSpan.js";

export const handleSetupPaymentV2 = createRoute({
	scopes: [Scopes.Billing.Write],
	body: SetupPaymentParamsV1Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		setRootSpanAttributes({ "billing.action": "setup_payment" });

		const result = await billingActions.setupPayment({
			ctx,
			params: body,
		});

		return c.json(result, 200);
	},
});
