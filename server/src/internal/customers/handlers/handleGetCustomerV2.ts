import {
	backwardsChangeActive,
	CusExpand,
	GetCustomerQuerySchema,
	V0_2_InvoicesAlwaysExpanded,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getApiCustomer } from "../cusUtils/apiCusUtils/getApiCustomer.js";

export const handleGetCustomerV2 = createRoute({
	query: GetCustomerQuerySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const customerId = c.req.param("customer_id");
		const {
			expand = [],
			skip_cache = false,
			with_autumn_id,
		} = c.req.valid("query");

		// SIDE EFFECT
		if (
			backwardsChangeActive({
				apiVersion: ctx.apiVersion,
				versionChange: V0_2_InvoicesAlwaysExpanded,
			})
		) {
			expand.push(CusExpand.Invoices);
		}

		const customer = await getApiCustomer({
			ctx,
			customerId,
			expand,
			skipCache: skip_cache,
			withAutumnId: with_autumn_id,
		});

		return c.json(customer);
	},
});
