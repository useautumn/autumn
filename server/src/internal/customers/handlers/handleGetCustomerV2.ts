import {
	AffectedResource,
	ApiVersion,
	backwardsChangeActive,
	CusExpand,
	type EntityExpand,
	GetCustomerQuerySchema,
	V0_2_InvoicesAlwaysExpanded,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getCusWithCache } from "../cusCache/getCusWithCache.js";
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
			expand: expand as (CusExpand | EntityExpand)[],
			logger,
			allowNotFound: false,
		});

		const customer = await getApiCustomer({
			ctx,
			fullCus: fullCus,
		});

		return c.json(customer);
	},
});
