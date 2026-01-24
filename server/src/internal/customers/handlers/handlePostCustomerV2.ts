import {
	AffectedResource,
	ApiVersion,
	backwardsChangeActive,
	CreateCustomerParamsSchema,
	CreateCustomerQuerySchema,
	CusExpand,
	CustomerDataSchema,
	V0_2_InvoicesAlwaysExpanded,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getApiCustomer } from "../cusUtils/apiCusUtils/getApiCustomer.js";
import { getOrCreateCachedFullCustomer } from "../cusUtils/fullCustomerCacheUtils/getOrCreateCachedFullCustomer.js";

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

		const customerData = CustomerDataSchema.parse(createCusParams);

		const fullCustomer = await getOrCreateCachedFullCustomer({
			ctx,
			params: {
				customer_id: createCusParams.id,
				customer_data: customerData,
				entity_id: createCusParams.entity_id,
				entity_data: createCusParams.entity_data,
			},
			source: "handlePostCustomer",
			internalOptions: createCusParams.internal_options,
		});

		const apiCustomer = await getApiCustomer({
			ctx,
			fullCustomer,
			withAutumnId: with_autumn_id,
		});

		const duration = Date.now() - start;
		ctx.logger.debug(`[post-customer] duration: ${duration}ms`);

		return c.json(apiCustomer);
	},
});
