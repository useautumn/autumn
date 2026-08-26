import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { generateRequest } from "@/internal/billing/v2/actions/generateRequest/generateRequest";
import { GenerateBillingRequestParamsSchema } from "@/internal/billing/v2/actions/generateRequest/generationSchemas";

export const handleGenerateBillingRequest = createRoute({
	scopes: [Scopes.Billing.Read],
	body: GenerateBillingRequestParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		const { request, unrepresentable } = await generateRequest({
			ctx,
			params,
		});

		return c.json(
			{
				object: "billing_request_generation",
				request,
				tool: params.tool,
				unrepresentable,
			},
			200,
		);
	},
});
