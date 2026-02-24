import { AffectedResource, GetPlanParamsV0Schema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ProductService } from "../../ProductService.js";
import { getPlanResponse } from "../../productUtils/productResponseUtils/getPlanResponse.js";

export const handleGetPlanV2 = createRoute({
	body: GetPlanParamsV0Schema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const { plan_id, version } = c.req.valid("json");
		const ctx = c.get("ctx");

		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: plan_id,
			orgId: ctx.org.id,
			env: ctx.env,
			version: version,
		});

		const latestPlan = await getPlanResponse({
			product: fullProduct,
			features: ctx.features,
		});

		return c.json(latestPlan);
	},
});
