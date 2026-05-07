import {
	AffectedResource,
	ListEntitiesParamsSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { entityActions } from "../actions/index.js";

export const handleListEntitiesV2 = createRoute({
	scopes: [Scopes.Customers.Read],
	body: ListEntitiesParamsSchema,
	resource: AffectedResource.Entity,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const response = await entityActions.list({
			ctx,
			customerId: body.customer_id,
			limit: body.limit,
			offset: body.offset,
		});
		return c.json(response);
	},
});
