import { Scopes, UpdateWebhookParamsSchema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { assertVercelEventsAllowed } from "../actions/assertVercelEventsAllowed.js";
import { ensureSvixAppId } from "../actions/ensureSvixAppId.js";
import { updateWebhook } from "../actions/updateWebhook.js";

export const handleUpdateWebhook = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: UpdateWebhookParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		await assertVercelEventsAllowed({
			org: ctx.org,
			events: params.events ?? [],
		});
		const appId = await ensureSvixAppId({ ctx });

		return c.json(await updateWebhook({ appId, params }));
	},
});
