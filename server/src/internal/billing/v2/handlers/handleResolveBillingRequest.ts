import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import {
	ResolveBillingRequestParamsSchema,
	resolveBillingRequest,
} from "@/internal/billing/v2/actions/resolveBillingRequest";

export const handleResolveBillingRequest = createRoute({
	scopes: [Scopes.Billing.Read],
	body: ResolveBillingRequestParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		const { request, unrepresentable } = await resolveBillingRequest({
			ctx,
			params,
		});

		return c.json(
			{ object: "billing_request_resolution", request, unrepresentable },
			200,
		);
	},
});
