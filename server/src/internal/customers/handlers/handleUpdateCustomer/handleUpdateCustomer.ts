import {
	AffectedResource,
	ApiVersion,
	GetCustomerQuerySchema,
	UpdateCustomerParamsV0Schema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { customerActions } from "@/internal/customers/actions";
import { getApiCustomer } from "@/internal/customers/cusUtils/apiCusUtils/getApiCustomer";
import { getOrSetCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer";

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
				...params,
			},
		});

		ctx.skipCache = true;
		const fullCustomer = await getOrSetCachedFullCustomer({
			ctx,
			customerId: newCustomerId,
			source: "handleUpdateCustomerV2",
		});

		const customerDetails = await getApiCustomer({
			ctx,
			fullCustomer,
		});

		return c.json(customerDetails);
	},
});
