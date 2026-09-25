import { Scopes, SyncWebhooksParamsSchema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ensureSvixAppId } from "../actions/ensureSvixAppId.js";
import { listWebhooks } from "../actions/listWebhooks.js";
import { computeWebhookSyncChanges } from "../actions/sync/computeWebhookSyncChanges.js";

/** What webhooks.sync would change, without writing. Same body. */
export const handlePreviewSyncWebhooks = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: SyncWebhooksParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { webhooks } = c.req.valid("json");

		const appId = await ensureSvixAppId({ ctx });
		const remote = await listWebhooks({ appId });

		return c.json({
			changes: computeWebhookSyncChanges({
				remote,
				stated: webhooks,
				now: Date.now(),
			}),
		});
	},
});
