import {
	AffectedResource,
	ApiVersion,
	GetEntityQuerySchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getApiEntity } from "../../entityUtils/apiEntityUtils/getApiEntity.js";

export const handleGetEntity = createRoute({
	versionedQuery: {
		latest: GetEntityQuerySchema,
		[ApiVersion.V1_2]: GetEntityQuerySchema,
	},
	resource: AffectedResource.Entity,
	handler: async (c) => {
		const { customer_id, entity_id } = c.req.param();
		const ctx = c.get("ctx");
		const { with_autumn_id } = c.req.valid("query");

		const apiEntity = await getApiEntity({
			ctx,
			customerId: customer_id,
			entityId: entity_id,
			withAutumnId: with_autumn_id,
		});

		return c.json(apiEntity);
	},
});
