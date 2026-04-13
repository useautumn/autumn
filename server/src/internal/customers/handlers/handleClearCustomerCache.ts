import { z } from "zod/v4";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { batchDeleteCachedFullCustomers } from "../cusUtils/fullCustomerCacheUtils/batchDeleteCachedFullCustomers";
import { deleteCachedFullCustomer } from "../cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

export const handleClearCustomerCache = createRoute({
	body: z.object({
		customer_id: z.string().optional(),
		customer_ids: z.array(z.string()).optional(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id, customer_ids } = c.req.valid("json");

		if (customer_id) {
			await deleteCachedFullCustomer({
				customerId: customer_id,
				ctx,
				source: `handleClearCustomerCache, deleting single customer cache`,
			});
		}

		if (customer_ids) {
			await batchDeleteCachedFullCustomers({
				customers: customer_ids.map((id) => ({
					customerId: id,
					orgId: ctx.org.id,
					env: ctx.env,
				})),
			});
		}

		return c.json({
			success: true,
		});
	},
});
