import {
	AffectedResource,
	ApiVersion,
	GetCustomerQuerySchema,
	UpdateCustomerParamsV0Schema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { customerActions } from "@/internal/customers/actions";

export const handleUpdateCustomer = createRoute({
	scopes: [Scopes.Customers.Write],
	body: UpdateCustomerParamsV0Schema,
	versionedQuery: {
		latest: GetCustomerQuerySchema,
		[ApiVersion.V1_2]: GetCustomerQuerySchema,
	},
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");

		const { customer_id } = c.req.param();

		const params = c.req.valid("json");
		const { apiCustomer } = await customerActions.update({
			ctx,
			params: {
				customer_id,
				new_customer_id: params.id,
				...params,
			},
		});

		return c.json(apiCustomer);
	},
});
