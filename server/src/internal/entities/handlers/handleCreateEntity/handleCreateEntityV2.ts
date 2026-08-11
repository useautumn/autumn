import { CreateEntityParamsV1Schema, Scopes } from "@autumn/shared";
import type { z } from "zod/v4";
import { createRoute } from "../../../../honoMiddlewares/routeHandler.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { entityActions } from "../../actions/index.js";

export const createEntityV2 = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: z.infer<typeof CreateEntityParamsV1Schema>;
}) => {
	ctx.skipCache = true;

	const apiEntities = await entityActions.batchCreate({
		ctx,
		customerId: params.customer_id,
		createEntityData: [
			{
				id: params.entity_id,
				name: params.name,
				feature_id: params.feature_id,
				billing_controls: params.billing_controls,
			},
		],
		customerData: params.customer_data,
	});

	return apiEntities[0];
};

export const handleCreateEntityV2 = createRoute({
	scopes: [Scopes.Customers.Write],
	body: CreateEntityParamsV1Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		return c.json(await createEntityV2({ ctx, params }));
	},
});
