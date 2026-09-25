import { Scopes, SyncWebhooksParamsSchema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ensureSvixAppId } from "../actions/ensureSvixAppId.js";
import { syncWebhooks } from "../actions/sync/syncWebhooks.js";

export const handleSyncWebhooks = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: SyncWebhooksParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { webhooks } = c.req.valid("json");

		const appId = await ensureSvixAppId({ ctx });

		return c.json(await syncWebhooks({ appId, stated: webhooks }));
	},
});
