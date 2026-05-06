import {
	AffectedResource,
	backwardsChangeActive,
	CustomerExpand,
	GetCustomerParamsV1Schema,
	Scopes,
	V0_2_InvoicesAlwaysExpanded,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getApiCustomerByRollout } from "../actions/getApiCustomerByRollout.js";

export const handleGetCustomerV3 = createRoute({
	scopes: [Scopes.Customers.Read],
	body: GetCustomerParamsV1Schema,
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id: customerId, with_autumn_id = false } =
			c.req.valid("json");

		if (
			backwardsChangeActive({
				apiVersion: ctx.apiVersion,
				versionChange: V0_2_InvoicesAlwaysExpanded,
			})
		) {
			ctx.expand.push(CustomerExpand.Invoices);
		}

		const start = Date.now();

		const customer = await getApiCustomerByRollout({
			ctx,
			customerId,
			source: "handleGetCustomerV3",
			withAutumnId: with_autumn_id,
		});

		const duration = Date.now() - start;
		ctx.logger.debug(`[get-customer] getApiCustomer duration: ${duration}ms`);

		return c.json(customer);
	},
});
