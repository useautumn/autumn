import {
	AffectedResource,
	ApiVersion,
	GetCustomerQuerySchema,
	UpdateCustomerParamsV0Schema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { customerActions } from "@/internal/customers/actions";
import { getApiCustomer } from "@/internal/customers/cusUtils/apiCusUtils/getApiCustomer";

export const handleUpdateCustomer = createRoute({
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
		const { oldCustomer, newFullCustomer } = await customerActions.update({
			ctx,
			params: {
				customer_id,
				new_customer_id: params.id,
				...params,
			},
		});

		const customerDetails = await getApiCustomer({
			ctx,
			fullCustomer: newFullCustomer,
		});

		return c.json(customerDetails);
	},
});
