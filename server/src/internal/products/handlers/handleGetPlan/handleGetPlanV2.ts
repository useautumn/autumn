import { AffectedResource, GetPlanParamsV0Schema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { ProductService } from "../../ProductService.js";
import { getPlanResponse } from "../../productUtils/productResponseUtils/getPlanResponse.js";

export const handleGetPlanV2 = createRoute({
	body: GetPlanParamsV0Schema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const { plan_id, variant_id, version, minor_version, semver } =
			c.req.valid("json");
		const ctx = c.get("ctx");

		// Parse semver string (e.g. "2.10") into integer parts if provided
		let resolvedVersion = version;
		let resolvedMinorVersion = minor_version;
		if (semver) {
			const [maj, min] = semver.split(".").map(Number);
			resolvedVersion = maj;
			resolvedMinorVersion = min;
		}

		const fullProduct = variant_id
			? await ProductService.getVariant({
					db: ctx.db,
					planId: plan_id,
					variantId: variant_id,
					orgId: ctx.org.id,
					env: ctx.env,
					version: resolvedVersion,
					minorVersion: resolvedMinorVersion,
				})
			: await ProductService.getFull({
					db: ctx.db,
					idOrInternalId: plan_id,
					orgId: ctx.org.id,
					env: ctx.env,
					version: resolvedVersion,
				});

		const latestPlan = await getPlanResponse({
			product: fullProduct,
			features: ctx.features,
		});

		return c.json(latestPlan);
	},
});
