import {
	AffectedResource,
	ApiVersion,
	backwardsChangeActive,
	CustomerExpand,
	GetCustomerParamsSchema,
	V0_2_InvoicesAlwaysExpanded,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getApiCustomer } from "../cusUtils/apiCusUtils/getApiCustomer.js";
import { getOrSetCachedFullCustomer } from "../cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";

export const handleGetCustomerV3 = createRoute({
	body: GetCustomerParamsSchema,
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const { customer_id, with_autumn_id } = body;
		const { expand } = ctx;

		// SIDE EFFECT: Auto-expand invoices for older API versions
		if (
			backwardsChangeActive({
				apiVersion: ctx.apiVersion,
				versionChange: V0_2_InvoicesAlwaysExpanded,
			})
		) {
			expand.push(CustomerExpand.Invoices);
		}

		const start = Date.now();

		// Get FullCustomer from cache or DB (throws CustomerNotFoundError if not found)
		const fullCustomer = await getOrSetCachedFullCustomer({
			ctx,
			customerId: customer_id,
			source: "handleGetCustomerV3",
		});

		// Transform to ApiCustomer with version changes
		const customer = await getApiCustomer({
			ctx,
			fullCustomer,
			withAutumnId: with_autumn_id,
		});

		const duration = Date.now() - start;
		ctx.logger.debug(`[customers.get] getApiCustomer duration: ${duration}ms`);

		return c.json(customer);
	},
});
