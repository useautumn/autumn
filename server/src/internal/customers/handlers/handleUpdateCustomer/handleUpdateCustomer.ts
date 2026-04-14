import {
	AffectedResource,
	ApiVersion,
	GetCustomerQuerySchema,
	UpdateCustomerParamsV0Schema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { customerActions } from "@/internal/customers/actions";
import { getApiCustomerByRollout } from "@/internal/customers/actions/getApiCustomerByRollout.js";

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
		const newCustomerId = await customerActions.update({
			ctx,
			params: {
				customer_id,
				new_customer_id: params.id,
				...params,
			},
		});

		ctx.skipCache = true;
		const customerDetails = await getApiCustomerByRollout({
			ctx,
			customerId: newCustomerId,
			source: "handleUpdateCustomer",
		});

		return c.json(customerDetails);
	},
});
