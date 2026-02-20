import { CreateEntityParamsV1Schema } from "@autumn/shared";
import { createRoute } from "../../../../honoMiddlewares/routeHandler.js";
import { entityActions } from "../../actions/index.js";

export const handleCreateEntityV2 = createRoute({
	body: CreateEntityParamsV1Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		// Skip cache for entity creation
		ctx.skipCache = true;

		const { customer_id, customer_data } = body;

		const apiEntities = await entityActions.batchCreate({
			ctx,
			customerId: customer_id,
			createEntityData: [
				{
					id: body.entity_id,
					name: body.name,
					feature_id: body.feature_id,
				},
			],
			customerData: customer_data,
		});

		return c.json(apiEntities[0]);
	},
});
