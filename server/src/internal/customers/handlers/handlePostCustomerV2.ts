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
import { getOrSetCachedFullCustomer } from "../cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";
import { handleCreateCustomer } from "./handleCreateCustomer.js";

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

		// Create customer if ID provided, otherwise generate new one
		const newCustomer = await handleCreateCustomer({
			ctx,
			cusData: {
				id: createCusParams.id,
				name: createCusParams.name,
				email: createCusParams.email,
				fingerprint: createCusParams.fingerprint,
				metadata: createCusParams.metadata || {},
				stripe_id: createCusParams.stripe_id,
			},
			createDefaultProducts: createCusParams.disable_default !== true,
		});

		// Get full customer from cache/DB
		const fullCustomer = await getOrSetCachedFullCustomer({
			ctx,
			customerId: newCustomer.id || newCustomer.internal_id,
			source: "handlePostCustomer",
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
