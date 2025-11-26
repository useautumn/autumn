import {
	AffectedResource,
	ApiVersion,
	backwardsChangeActive,
	CreateCustomerParamsSchema,
	CreateCustomerQuerySchema,
	CusExpand,
	V0_2_InvoicesAlwaysExpanded,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getApiCustomer } from "../cusUtils/apiCusUtils/getApiCustomer.js";
import { getOrCreateApiCustomer } from "../cusUtils/getOrCreateApiCustomer.js";

export const handlePostCustomer = createRoute({
	versionedQuery: {
		latest: CreateCustomerQuerySchema,
		[ApiVersion.V1_2]: CreateCustomerQuerySchema,
	},
	resource: AffectedResource.Customer,
	body: CreateCustomerParamsSchema,

	handler: async (c) => {
		const ctx = c.get("ctx");

		const { expand = [], with_autumn_id } = c.req.valid("query");
		const createCusParams = c.req.valid("json");

		// SIDE EFFECT
		if (
			backwardsChangeActive({
				apiVersion: ctx.apiVersion,
				versionChange: V0_2_InvoicesAlwaysExpanded,
			})
		) {
			expand.push(CusExpand.Invoices);
		}

		const start = Date.now();
		const baseData = await getOrCreateApiCustomer({
			ctx,
			customerId: createCusParams.id,
			customerData: createCusParams,
		});

		const apiCustomer = await getApiCustomer({
			ctx,
			customerId: createCusParams.id || "",
			withAutumnId: with_autumn_id,
			baseData: {
				apiCustomer: baseData.apiCustomer,
				legacyData: baseData.legacyData || {
					cusProductLegacyData: {},
					cusFeatureLegacyData: {},
				},
			},
		});
		const duration = Date.now() - start;
		ctx.logger.debug(`[post-customer] duration: ${duration}ms`);

		return c.json(apiCustomer);
	},
});
