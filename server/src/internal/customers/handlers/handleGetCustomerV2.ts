import { GetCustomerQuerySchema } from "@autumn/shared";
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

		logger.info(`[V2] Getting customer ${customerId} for org ${org.slug}`);
		const startTime = Date.now();

		const fullCus = await getCusWithCache({
			db,
			idOrInternalId: customerId,
			org,
			env,
			expand,
			logger,
			allowNotFound: false,
		});

		logger.info(`[V2] Get customer took ${Date.now() - startTime}ms`);

		const customer = await getApiCustomer({
			ctx,
			fullCus: fullCus,
			expand,
		});

		return c.json(customer);
	},
});
