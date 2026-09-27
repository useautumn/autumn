import {
	CreateWebhookParamsSchema,
	ErrCode,
	RecaseError,
	Scopes,
	webhookAppKindOf,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { findWebhook } from "../actions/apps/locateWebhook.js";
import { ensureWebhookAppId } from "../actions/apps/webhookApps.js";
import { createWebhook } from "../actions/createWebhook.js";

export const handleCreateWebhook = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: CreateWebhookParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");
		// Svix keeps ids unique per app only; ours are unique across both.
		if (await findWebhook({ ctx, id: params.id }))
			throw new RecaseError({
				message: `A webhook with id ${params.id} already exists`,
				code: ErrCode.DuplicateWebhookId,
				statusCode: 409,
			});
		const appId = await ensureWebhookAppId({
			ctx,
			kind: webhookAppKindOf({ events: params.events }),
		});
		const { webhook, secret } = await createWebhook({ appId, params });
		return c.json({ ...webhook, secret });
	},
});
