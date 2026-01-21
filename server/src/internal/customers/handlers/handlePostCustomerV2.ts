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
import { captureOrgEvent } from "@/utils/posthog.js";
import { getApiCustomer } from "../cusUtils/apiCusUtils/getApiCustomer.js";
import { getOrCreateCachedFullCustomer } from "../cusUtils/fullCustomerCacheUtils/getOrCreateCachedFullCustomer.js";
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

		const fullCustomer = await getOrCreateCachedFullCustomer({
			ctx,
			params: {
				customer_id: createCusParams.id,
				customer_data: {
					name: createCusParams.name,
					email: createCusParams.email,
					fingerprint: createCusParams.fingerprint,
					metadata: createCusParams.metadata || {},
					stripe_id: createCusParams.stripe_id,
					disable_default: createCusParams.disable_default,
				},
			},
			source: "handlePostCustomer",
		});

		const apiCustomer = await getApiCustomer({
			ctx,
			fullCustomer,
			withAutumnId: with_autumn_id,
		});

		const duration = Date.now() - start;
		ctx.logger.debug(`[post-customer] duration: ${duration}ms`);

		await captureOrgEvent({
			orgId: ctx.org.id,
			event: "customer_created_via_api",
			properties: {
				org_slug: ctx.org.slug,
				customer_id: fullCustomer.id || fullCustomer.internal_id,
				env: ctx.env,
			},
		});

		return c.json(apiCustomer);
	},
});
