import {
	AffectedResource,
	ApiVersion,
	backwardsChangeActive,
	CusExpand,
	GetCustomerQuerySchema,
	V0_2_InvoicesAlwaysExpanded,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getApiCustomer } from "../cusUtils/apiCusUtils/getApiCustomer.js";
import { getOrSetCachedFullCustomer } from "../cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";

export const handleGetCustomerV2 = createRoute({
	versionedQuery: {
		latest: GetCustomerQuerySchema,
		[ApiVersion.V1_2]: GetCustomerQuerySchema,
	},
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const customerId = c.req.param("customer_id");
		const { expand } = ctx;
		const { with_autumn_id } = c.req.valid("query");

		// SIDE EFFECT
		// !ctx.org.config.disable_v1_invoices &&
		if (
			backwardsChangeActive({
				apiVersion: ctx.apiVersion,
				versionChange: V0_2_InvoicesAlwaysExpanded,
			})
		) {
			expand.push(CusExpand.Invoices);
		}

		const start = Date.now();

		// Get FullCustomer from cache or DB
		const fullCustomer = await getOrSetCachedFullCustomer({
			ctx,
			customerId,
			source: "handleGetCustomerV2",
		});

		// Transform to ApiCustomer with version changes
		const customer = await getApiCustomer({
			ctx,
			fullCustomer,
			withAutumnId: with_autumn_id,
		});

		const duration = Date.now() - start;
		ctx.logger.debug(`[get-customer] getApiCustomer duration: ${duration}ms`);

		return c.json(customer);
	},
});
