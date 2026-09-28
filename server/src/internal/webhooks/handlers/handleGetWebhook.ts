import { GetWebhookParamsSchema, Scopes } from "@autumn/shared";
import { svixEndpointToWebhook } from "@/external/svix/endpoints/svixEndpointToWebhook.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { locateWebhook } from "../actions/apps/locateWebhook.js";

export const handleGetWebhook = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: GetWebhookParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { id } = c.req.valid("json");
		const { endpoint } = await locateWebhook({ ctx, id });
		return c.json(svixEndpointToWebhook({ endpoint }));
	},
});
