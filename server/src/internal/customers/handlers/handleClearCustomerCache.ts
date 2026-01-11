import { z } from "zod/v4";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { batchDeleteCachedCustomers } from "../cusUtils/apiCusCacheUtils/batchDeleteCachedCustomers";
import { deleteCachedApiCustomer } from "../cusUtils/apiCusCacheUtils/deleteCachedApiCustomer";

export const handleClearCustomerCache = createRoute({
	body: z.object({
		customer_id: z.string().optional(),
		customer_ids: z.array(z.string()).optional(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id, customer_ids } = c.req.valid("json");

		if (customer_id) {
			await deleteCachedApiCustomer({
				customerId: customer_id,
				orgId: ctx.org.id,
				env: ctx.env,
				source: `handleClearCustomerCache, deleting single customer cache`,
				logger: ctx.logger,
			});
		}

		if (customer_ids) {
			await batchDeleteCachedCustomers({
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
