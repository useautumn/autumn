import { SetUsageParamsSchema } from "@autumn/shared";
import { getOrCreateCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrCreateCachedFullCustomer.js";
import { createRoute } from "../../../honoMiddlewares/routeHandler.js";
import { runUpdateUsage } from "../updateBalance/runUpdateUsage.js";

export const handleSetUsage = createRoute({
	body: SetUsageParamsSchema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		const fullCustomer = await getOrCreateCachedFullCustomer({
			ctx,
			params: {
				customer_id: body.customer_id,
				entity_id: body.entity_id,
			},
			source: "handleSetUsage",
		});

		await runUpdateUsage({
			ctx,
			params: {
				customer_id: body.customer_id,
				feature_id: body.feature_id,
				usage: body.value,
				entity_id: body.entity_id,
			},
			fullCustomer,
		});

		return c.json({ success: true });
	},
});
