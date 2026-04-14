import { AffectedResource, UpdateCustomerParamsV1Schema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getApiCustomerByRollout } from "@/internal/customers/actions/getApiCustomerByRollout.js";
import { customerActions } from "@/internal/customers/actions/index.js";

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
		const customerDetails = await getApiCustomerByRollout({
			ctx,
			customerId,
			source: "handleUpdateCustomerV2",
		});

		return c.json(customerDetails);
	},
});
