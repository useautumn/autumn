import { SetUsageParamsSchema } from "@autumn/shared";
import { createRoute } from "../../../honoMiddlewares/routeHandler.js";
import { runUpdateUsage } from "../updateBalance/runUpdateUsage.js";

export const handleSetUsage = createRoute({
	body: SetUsageParamsSchema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		await runUpdateUsage({
			ctx,
			params: {
				customer_id: body.customer_id,
				feature_id: body.feature_id,
				usage: body.value,
				entity_id: body.entity_id,
			},
		});

		return c.json({ success: true });
	},
});
