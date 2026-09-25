import { CreateWebhookParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { assertVercelEventsAllowed } from "../actions/assertVercelEventsAllowed.js";
import { createWebhook } from "../actions/createWebhook.js";
import { ensureSvixAppId } from "../actions/ensureSvixAppId.js";

export const handleCreateWebhook = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: CreateWebhookParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		await assertVercelEventsAllowed({ org: ctx.org, events: params.events });
		const appId = await ensureSvixAppId({ ctx });
		const { webhook, secret } = await createWebhook({ appId, params });

		return c.json({ ...webhook, secret });
	},
});
