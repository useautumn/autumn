import {
	AffectedResource,
	apiPlan,
	CreatePlanParamsV2Schema,
	type CreateProductV2Params,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { createProduct } from "../../../product/actions/createProduct.js";
import { ProductService } from "../../ProductService.js";
import { getPlanResponse } from "../../productUtils/productResponseUtils/getPlanResponse.js";

export const handleCreatePlanV2 = createRoute({
	body: CreatePlanParamsV2Schema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		const createParams = apiPlan.map.paramsV1ToProductV2({
			ctx,
			params: {
				id: body.plan_id,
				...body,
			},
		}) as CreateProductV2Params;

		await createProduct({
			ctx,
			data: createParams,
		});

		const [fullProduct] = await Promise.all([
			ProductService.getFull({
				db: ctx.db,
				idOrInternalId: body.plan_id,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		]);

		const latestPlan = await getPlanResponse({
			product: fullProduct,
			features: ctx.features,
		});

		return c.json(latestPlan);
	},
});
