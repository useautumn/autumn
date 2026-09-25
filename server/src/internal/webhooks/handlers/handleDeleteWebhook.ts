import { DeleteWebhookParamsSchema, Scopes } from "@autumn/shared";
import { withSvixErrors } from "@/external/svix/endpoints/withSvixErrors.js";
import { createSvixCli } from "@/external/svix/svixUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ensureSvixAppId } from "../actions/ensureSvixAppId.js";

export const handleDeleteWebhook = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: DeleteWebhookParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { id } = c.req.valid("json");

		const appId = await ensureSvixAppId({ ctx });
		await withSvixErrors({
			webhookId: id,
			run: () => createSvixCli().endpoint.delete(appId, id),
		});

		return c.json({ success: true as const });
	},
});
