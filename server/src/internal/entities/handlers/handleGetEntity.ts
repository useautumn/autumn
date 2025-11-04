import { GetEntityQuerySchema } from "@autumn/shared";
import { createRoute } from "../../../honoMiddlewares/routeHandler.js";
import { getApiEntity } from "../entityUtils/apiEntityUtils/getApiEntity.js";

export const handleGetEntity = createRoute({
	query: GetEntityQuerySchema,
	handler: async (c) => {
		const { customer_id, entity_id } = c.req.param();
		const ctx = c.get("ctx");
		const { expand, skip_cache } = c.req.valid("query");

		const apiEntity = await getApiEntity({
			ctx,
			customerId: customer_id,
			entityId: entity_id,
			expand,
			skipCache: skip_cache,
		});

		return c.json(apiEntity);
	},
});
