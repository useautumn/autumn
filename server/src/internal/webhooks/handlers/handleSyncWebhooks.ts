import { Scopes, SyncWebhooksParamsSchema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	ensureWebhookAppId,
	listWebhookApps,
} from "../actions/apps/webhookApps.js";
import { syncWebhooks } from "../actions/sync/syncWebhooks.js";

export const handleSyncWebhooks = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: SyncWebhooksParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { webhooks } = c.req.valid("json");
		return c.json(
			await syncWebhooks({
				apps: await listWebhookApps({ ctx }),
				appIdForKind: (kind) => ensureWebhookAppId({ ctx, kind }),
				stated: webhooks,
			}),
		);
	},
});
