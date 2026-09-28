import { ListWebhooksParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { listWebhookApps } from "../actions/apps/webhookApps.js";
import { listWebhooks } from "../actions/listWebhooks.js";

export const handleListWebhooks = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: ListWebhooksParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const apps = await listWebhookApps({ ctx });
		return c.json({ list: await listWebhooks({ apps }) });
	},
});
