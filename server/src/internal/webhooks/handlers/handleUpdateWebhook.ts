import {
	ErrCode,
	RecaseError,
	Scopes,
	UpdateWebhookParamsSchema,
	WEBHOOK_APP_SWITCH_MESSAGE,
	webhookAppKindOf,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { locateWebhook } from "../actions/apps/locateWebhook.js";
import { updateWebhook } from "../actions/updateWebhook.js";

export const handleUpdateWebhook = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: UpdateWebhookParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");
		const { appId, kind } = await locateWebhook({ ctx, id: params.id });
		if (params.events && webhookAppKindOf({ events: params.events }) !== kind)
			throw new RecaseError({
				message: WEBHOOK_APP_SWITCH_MESSAGE,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		return c.json(await updateWebhook({ appId, params }));
	},
});
