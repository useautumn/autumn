import { AffectedResource, UpdateCustomerParamsV1Schema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { customerActions } from "@/internal/customers/actions/index.js";

export const handleUpdateCustomerV2 = createRoute({
	scopes: [Scopes.Customers.Write],
	body: UpdateCustomerParamsV1Schema,
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");
		const { apiCustomer } = await customerActions.update({
			ctx,
			params,
		});

		return c.json(apiCustomer);
	},
});
