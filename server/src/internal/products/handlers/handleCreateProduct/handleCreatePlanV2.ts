import {
	AffectedResource,
	apiPlan,
	CreatePlanParamsV1Schema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "../../ProductService.js";
import { getPlanResponse } from "../../productUtils/productResponseUtils/getPlanResponse.js";
import { createProduct } from "../../actions/productActions/createProduct.js";

export const handleCreatePlanV2 = createRoute({
	body: CreatePlanParamsV1Schema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		const createParams = apiPlan.map.paramsV1ToProductV2({
			ctx,
			params: body,
		});

		await createProduct({
			ctx,
			data: createParams,
		});

		const [fullProduct, features] = await Promise.all([
			ProductService.getFull({
				db: ctx.db,
				idOrInternalId: body.id,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
			FeatureService.list({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		]);

		const latestPlan = await getPlanResponse({
			product: fullProduct,
			features,
		});

		return c.json(latestPlan);
	},
});
