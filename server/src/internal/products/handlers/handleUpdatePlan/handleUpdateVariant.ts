import { AffectedResource, UpdateVariantParamsSchema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { updateVariant } from "@/internal/products/actions/updateVariant.js";
import { getPlanResponse } from "../../productUtils/productResponseUtils/getPlanResponse.js";

export const handleUpdateVariant = createRoute({
	body: UpdateVariantParamsSchema,
	resource: AffectedResource.Product,
	handler: async (c) => {
		const { plan_id, variant_id, ...planParams } = c.req.valid("json");
		const ctx = c.get("ctx");

		const latestVariant = await updateVariant({
			ctx,
			planId: plan_id,
			variantId: variant_id,
			updates: planParams,
		});

		return c.json(
			await getPlanResponse({
				product: latestVariant,
				features: ctx.features,
			}),
		);
	},
});
