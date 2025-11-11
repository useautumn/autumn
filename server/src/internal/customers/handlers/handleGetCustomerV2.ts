import {
	AffectedResource,
	ApiVersion,
	backwardsChangeActive,
	CusExpand,
	GetCustomerQuerySchema,
	V0_2_InvoicesAlwaysExpanded,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getApiCustomer } from "../cusUtils/apiCusUtils/getApiCustomer.js";

export const handleGetCustomerV2 = createRoute({
	versionedQuery: {
		latest: GetCustomerQuerySchema,
		[ApiVersion.V1_2]: GetCustomerQuerySchema,
	},
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const customerId = c.req.param("customer_id");
		const { env, db, logger, org, expand } = ctx;
		const { skip_cache = false, with_autumn_id } = c.req.valid("query");

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

			skipCache: skip_cache,
			withAutumnId: with_autumn_id,
		});

		return c.json(customer);
	},
});
