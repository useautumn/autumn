import { Scopes, SyncWebhooksParamsSchema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ensureSvixAppId } from "../actions/ensureSvixAppId.js";
import { computeWebhookSyncChanges } from "../actions/sync/computeWebhookSyncChanges.js";
import { listSyncRemote } from "../actions/sync/listSyncRemote.js";

/** What webhooks.sync would change, without writing. Same body. */
export const handlePreviewSyncWebhooks = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: SyncWebhooksParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { webhooks } = c.req.valid("json");

		const appId = await ensureSvixAppId({ ctx });
		const { remote, uidlessIds } = await listSyncRemote({ appId });

		return c.json(
			computeWebhookSyncChanges({
				remote,
				uidlessIds,
				stated: webhooks,
				now: Date.now(),
			}),
		);
	},
});
