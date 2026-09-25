import { GetWebhookParamsSchema, Scopes } from "@autumn/shared";
import { svixEndpointToWebhook } from "@/external/svix/endpoints/svixEndpointToWebhook.js";
import { withSvixErrors } from "@/external/svix/endpoints/withSvixErrors.js";
import { createSvixCli } from "@/external/svix/svixUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ensureSvixAppId } from "../actions/ensureSvixAppId.js";

export const handleGetWebhook = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: GetWebhookParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { id } = c.req.valid("json");

		const appId = await ensureSvixAppId({ ctx });
		const endpoint = await withSvixErrors({
			webhookId: id,
			run: () => createSvixCli().endpoint.get(appId, id),
		});

		return c.json(svixEndpointToWebhook({ endpoint }));
	},
});
