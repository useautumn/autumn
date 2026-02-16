import { AffectedResource, UpdateCustomerParamsV1Schema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { customerActions } from "@/internal/customers/actions/index.js";
import { getApiCustomer } from "@/internal/customers/cusUtils/apiCusUtils/getApiCustomer.js";
import { getOrSetCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";

export const handleUpdateCustomerV2 = createRoute({
	body: UpdateCustomerParamsV1Schema,
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");
		const customerId = await customerActions.update({
			ctx,
			params,
		});

		ctx.skipCache = true;
		const fullCustomer = await getOrSetCachedFullCustomer({
			ctx,
			customerId,
			source: "handleUpdateCustomerV2",
		});

		const customerDetails = await getApiCustomer({
			ctx,
			fullCustomer,
		});

		return c.json(customerDetails);
	},
});
