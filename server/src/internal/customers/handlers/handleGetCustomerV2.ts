import {
	backwardsChangeActive,
	CusExpand,
	GetCustomerQuerySchema,
	V0_2_InvoicesAlwaysExpanded,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getCusWithCache } from "../cusCache/getCusWithCache.js";
import { getApiCustomer } from "../cusUtils/apiCusUtils/getApiCustomer.js";

export const handleGetCustomerV2 = createRoute({
	query: GetCustomerQuerySchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const customerId = c.req.param("customer_id");
		const { env, db, logger, org } = ctx;
		const { expand = [] } = c.req.valid("query");

		// SIDE EFFECT
		if (
			backwardsChangeActive({
				apiVersion: ctx.apiVersion,
				versionChange: V0_2_InvoicesAlwaysExpanded,
			})
		) {
			expand.push(CusExpand.Invoices);
		}

		const fullCus = await getCusWithCache({
			db,
			idOrInternalId: customerId,
			org,
			env,
			expand,
			logger,
			allowNotFound: false,
		});

		const customer = await getApiCustomer({
			ctx,
			fullCus: fullCus,
			expand,
		});

		return c.json(customer);
	},
});
