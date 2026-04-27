import {
	AffectedResource,
	ApiVersion,
	GetEntityQuerySchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getApiEntityByRollout } from "../../actions/getApiEntityByRollout.js";

export const handleGetEntity = createRoute({
	scopes: [Scopes.Customers.Read],
	versionedQuery: {
		latest: GetEntityQuerySchema,
		[ApiVersion.V1_2]: GetEntityQuerySchema,
	},
	resource: AffectedResource.Entity,
	handler: async (c) => {
		const { customer_id, entity_id } = c.req.param();
		const ctx = c.get("ctx");
		const { with_autumn_id } = c.req.valid("query");

		const apiEntity = await getApiEntityByRollout({
			ctx,
			customerId: customer_id,
			entityId: entity_id,
			source: "handleGetEntity",
			withAutumnId: with_autumn_id,
		});

		return c.json(apiEntity);
	},
});
