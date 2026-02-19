import {
	AffectedResource,
	apiPlan,
	UpdatePlanParamsV2Schema,
	type UpdateProductV2Params,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { updateProduct } from "../../../product/actions/updateProduct.js";
import { ProductService } from "../../ProductService.js";
import { getPlanResponse } from "../../productUtils/productResponseUtils/getPlanResponse.js";

export const handleUpdatePlanV2 = createRoute({
	body: UpdatePlanParamsV2Schema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const body = c.req.valid("json");

		const { plan_id, new_plan_id, ...planParams } = body;
		const ctx = c.get("ctx");

		const initialFullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: plan_id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const updateProductV2Params = apiPlan.map.paramsV1ToProductV2({
			ctx,
			currentFullProduct: initialFullProduct,
			params: {
				id: new_plan_id,
				...planParams,
			},
		}) as UpdateProductV2Params;

		await updateProduct({
			ctx,
			productId: plan_id,
			query: {},
			updates: updateProductV2Params,
			initialFullProduct,
		});

		const latestPlanId = new_plan_id || plan_id;
		const latestFullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: latestPlanId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const latestPlan = await getPlanResponse({
			product: latestFullProduct,
			features: ctx.features,
		});

		return c.json(latestPlan);
	},
});
