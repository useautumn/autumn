import { AffectedResource, UpdateCustomerParamsV1Schema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { customerActions } from "@/internal/customers/actions/index.js";
import { getApiCustomer } from "@/internal/customers/cusUtils/apiCusUtils/getApiCustomer.js";

export const handleUpdateCustomerV2 = createRoute({
	body: UpdateCustomerParamsV1Schema,
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");
		const { newFullCustomer } = await customerActions.update({
			ctx,
			params,
		});

		const customerDetails = await getApiCustomer({
			ctx,
			fullCustomer: newFullCustomer,
		});

		return c.json(customerDetails);
	},
});
