import { AffectedResource } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { ProductService } from "../../ProductService.js";
import { getPlanResponse } from "../../productUtils/productResponseUtils/getPlanResponse.js";

const GetPlanV2BodySchema = z.object({
	plan_id: z.string().nonempty(),
});

export const handleGetPlanV2 = createRoute({
	body: GetPlanV2BodySchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const { plan_id } = c.req.valid("json");
		const ctx = c.get("ctx");

		const [fullProduct, features] = await Promise.all([
			ProductService.getFull({
				db: ctx.db,
				idOrInternalId: plan_id,
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
