import {
	ApiVersion,
	CreateEntityParamsV0Schema,
	CreateEntityQuerySchema,
	type CustomerData,
	notNullish,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "../../../../honoMiddlewares/routeHandler.js";
import { entityActions } from "../../actions/index.js";

export const handleCreateEntity = createRoute({
	query: CreateEntityQuerySchema,
	body: CreateEntityParamsV0Schema.or(z.array(CreateEntityParamsV0Schema)),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		// Skip cache for entity creation
		ctx.skipCache = true;

		const { customer_id } = c.req.param();
		const { with_autumn_id } = c.req.valid("query");

		let customerData: CustomerData | undefined;
		if (Array.isArray(body)) {
			customerData = body.filter((b) => notNullish(b.customer_data))?.[0]
				?.customer_data;
		} else {
			customerData = body.customer_data;
		}

		const apiEntities = await entityActions.batchCreate({
			ctx,
			customerId: customer_id,
			createEntityData: body,
			customerData,
			withAutumnId: with_autumn_id,
		});

		if (ctx.apiVersion.gte(ApiVersion.V1_2)) {
			if (Array.isArray(body) && body.length > 1) {
				return c.json({ list: apiEntities });
			} else {
				return c.json(apiEntities[0]);
			}
		} else {
			return c.json({ success: true });
		}
	},
});
